import {
  buildDaySummary,
  buildProvider,
  decryptSecret,
  encryptSecret,
  googleReviewUrl,
  isValidPlaceId,
  localDate,
  XeroClient,
  type DayOrder,
  type MyPosConfig,
  type PaymentProvider,
  type PaymentSetup,
  type RevolutConfig,
  type XeroApp,
  type XeroMapping,
  type XeroTokens,
} from "@round/core";
import { and, eq, gte, inArray, isNotNull, lt, or } from "drizzle-orm";
import { systemDb, withTenant } from "./index";
import * as t from "./schema";
import { Forbidden, NotFound, type Venue } from "./services";

export type IntegrationKind = "revolut" | "mypos" | "xero";

async function loadIntegration(venue: Venue, kind: IntegrationKind) {
  return withTenant(venue.tenantId, async (tx) => {
    const [row] = await tx.select().from(t.venueIntegration).where(and(eq(t.venueIntegration.venueId, venue.id), eq(t.venueIntegration.kind, kind)));
    return row ?? null;
  });
}

/** Saves a venue's integration. `secret` replaces the stored secret when given; null keeps it. */
export async function saveIntegration(venue: Venue, kind: IntegrationKind, config: Record<string, unknown>, secret: string | null, secretsKey: string) {
  await withTenant(venue.tenantId, async (tx) => {
    const values = { tenantId: venue.tenantId, venueId: venue.id, kind, config, updatedAt: new Date(), ...(secret !== null ? { secretEnc: encryptSecret(secret, secretsKey) } : {}) };
    await tx.insert(t.venueIntegration).values(values).onConflictDoUpdate({ target: [t.venueIntegration.venueId, t.venueIntegration.kind], set: values });
  });
}

/** What the back office may show: config and whether a secret is stored, never the secret. */
export async function integrationStatus(venue: Venue) {
  return withTenant(venue.tenantId, async (tx) => {
    const rows = await tx.select().from(t.venueIntegration).where(eq(t.venueIntegration.venueId, venue.id));
    return Object.fromEntries(rows.map((r) => [r.kind, { config: r.config, hasSecret: !!r.secretEnc, updatedAt: r.updatedAt }])) as Partial<
      Record<IntegrationKind, { config: Record<string, unknown>; hasSecret: boolean; updatedAt: Date }>
    >;
  });
}

// ---------------------------------------------------------------- payments

/** The venue's own payment set-up. Venues on "mock" use test payments. */
export async function paymentSetupFor(venue: Venue, secretsKey: string | undefined): Promise<PaymentSetup> {
  if (venue.paymentProvider === "mock") return { provider: "mock" };
  const row = await loadIntegration(venue, venue.paymentProvider);
  if (!row?.secretEnc || !secretsKey) throw new Forbidden(`${venue.name} has no ${venue.paymentProvider} keys set up`);
  const secret = JSON.parse(decryptSecret(row.secretEnc, secretsKey)) as Record<string, string>;
  if (venue.paymentProvider === "mypos") {
    const c = row.config as Partial<MyPosConfig>;
    return { provider: "mypos", sid: String(c.sid), walletNumber: String(c.walletNumber), keyIndex: Number(c.keyIndex), myposCertPem: String(c.myposCertPem), mode: c.mode === "live" ? "live" : "test", privateKeyPem: secret.privateKeyPem };
  }
  const c = row.config as Partial<RevolutConfig>;
  return {
    provider: "revolut",
    publicKey: String(c.publicKey ?? ""),
    apiBase: String(c.apiBase ?? "https://sandbox-merchant.revolut.com"),
    apiVersion: String(c.apiVersion ?? "2024-09-01"),
    secretKey: secret.secretKey,
    webhookSecret: secret.webhookSecret,
  };
}

export async function providerForVenue(venue: Venue, secretsKey: string | undefined): Promise<PaymentProvider> {
  return buildProvider(await paymentSetupFor(venue, secretsKey));
}

export async function setPaymentProvider(venue: Venue, provider: Venue["paymentProvider"]) {
  await withTenant(venue.tenantId, (tx) => tx.update(t.venue).set({ paymentProvider: provider }).where(eq(t.venue.id, venue.id)));
}

// ---------------------------------------------------------------- Google reviews

export async function setGooglePlaceId(venue: Venue, placeId: string | null) {
  if (placeId !== null && !isValidPlaceId(placeId)) throw new Forbidden("That doesn't look like a Google Place ID");
  await withTenant(venue.tenantId, (tx) => tx.update(t.venue).set({ googlePlaceId: placeId }).where(eq(t.venue.id, venue.id)));
}

/** Records that the guest opened the review form and returns Google's URL. No reward is given. */
export async function reviewRedirect(venue: Venue, orderId: string, customerId: string): Promise<string> {
  if (!venue.googlePlaceId) throw new NotFound("Reviews aren't set up");
  await withTenant(venue.tenantId, async (tx) => {
    const [o] = await tx.select().from(t.orders).where(and(eq(t.orders.id, orderId), eq(t.orders.customerId, customerId), eq(t.orders.venueId, venue.id)));
    if (!o) throw new NotFound("Order not found");
    if (!o.reviewClickedAt) await tx.update(t.orders).set({ reviewClickedAt: new Date() }).where(eq(t.orders.id, o.id));
  });
  return googleReviewUrl(venue.googlePlaceId);
}

export async function reviewStats(venue: Venue, from: Date, to: Date) {
  return withTenant(venue.tenantId, async (tx) => {
    const os = await tx
      .select({ clicked: t.orders.reviewClickedAt })
      .from(t.orders)
      .where(and(eq(t.orders.venueId, venue.id), eq(t.orders.status, "paid"), gte(t.orders.paidAt, from), lt(t.orders.paidAt, to)));
    return { orders: os.length, clicks: os.filter((o) => o.clicked).length };
  });
}

// ---------------------------------------------------------------- Xero

export interface XeroConfig extends XeroMapping {
  tenantId: string;
  tenantName: string;
}

export const DEFAULT_XERO_MAPPING: XeroMapping = {
  contactName: "Complete app sales",
  salesAccountCode: "200",
  taxType9: "",
  taxType23: "",
  creditAccountCode: "200",
  creditTaxType: "NONE",
  paymentAccountCode: "",
};

/** Called from the OAuth callback: stores tokens and the chosen Xero organisation. */
export async function connectXero(venue: Venue, app: XeroApp, code: string, secretsKey: string, fetchImpl?: typeof fetch) {
  const client = new XeroClient(app, fetchImpl);
  const tokens = await client.exchangeCode(code);
  const [org] = await client.connections(tokens.accessToken);
  if (!org) throw new Error("No Xero organisation was connected");
  const existing = await loadIntegration(venue, "xero");
  const mapping = { ...DEFAULT_XERO_MAPPING, ...((existing?.config ?? {}) as Partial<XeroMapping>) };
  await saveIntegration(venue, "xero", { ...mapping, tenantId: org.tenantId, tenantName: org.tenantName }, JSON.stringify(tokens), secretsKey);
  return org.tenantName;
}

export async function saveXeroMapping(venue: Venue, mapping: XeroMapping) {
  const existing = await loadIntegration(venue, "xero");
  if (!existing) throw new NotFound("Connect Xero first");
  await withTenant(venue.tenantId, (tx) =>
    tx.update(t.venueIntegration).set({ config: { ...existing.config, ...mapping }, updatedAt: new Date() }).where(eq(t.venueIntegration.id, existing.id)),
  );
}

/** Orders paid, and orders refunded, on one venue-local trading day. */
export async function dayOrders(venue: Venue, date: string): Promise<{ paid: DayOrder[]; refunded: DayOrder[] }> {
  const from = new Date(`${date}T00:00:00Z`);
  const lo = new Date(from.getTime() - 86_400_000);
  const hi = new Date(from.getTime() + 2 * 86_400_000);
  return withTenant(venue.tenantId, async (tx) => {
    const os = await tx
      .select()
      .from(t.orders)
      .where(
        and(
          eq(t.orders.venueId, venue.id),
          inArray(t.orders.status, ["paid", "refunded"]),
          or(and(gte(t.orders.paidAt, lo), lt(t.orders.paidAt, hi)), and(isNotNull(t.orders.refundedAt), gte(t.orders.refundedAt, lo), lt(t.orders.refundedAt, hi))),
        ),
      );
    const paid = os.filter((o) => o.paidAt && localDate(o.paidAt, venue.timezone) === date);
    const refunded = os.filter((o) => o.refundedAt && localDate(o.refundedAt, venue.timezone) === date);
    const ids = [...new Set([...paid, ...refunded].map((o) => o.id))];
    const lines = ids.length ? await tx.select().from(t.orderLine).where(inArray(t.orderLine.orderId, ids)) : [];
    const toDay = (o: (typeof os)[number]): DayOrder => ({
      lines: lines.filter((l) => l.orderId === o.id).map((l) => ({ grossCents: l.grossCents, vatRate: l.vatRate })),
      creditUsedCents: o.creditUsedCents,
      // Cash isn't in the card clearing account: it stays on the invoice until it's banked.
      amountPaidCents: o.provider === "cash" ? 0 : o.amountPaidCents,
    });
    return { paid: paid.map(toDay), refunded: refunded.map(toDay) };
  });
}

export type XeroSyncResult = "done" | "nothing" | "already" | "not_connected" | "not_mapped" | "error";

/**
 * Pushes one trading day to Xero. Safe to run repeatedly: a day marked done is
 * skipped, and Xero idempotency keys stop a retried post creating duplicates.
 */
export async function syncXeroDay(venue: Venue, date: string, app: XeroApp, secretsKey: string, fetchImpl?: typeof fetch): Promise<XeroSyncResult> {
  const row = await loadIntegration(venue, "xero");
  if (!row?.secretEnc) return "not_connected";
  const cfg = row.config as unknown as XeroConfig;
  if (!cfg.taxType9 || !cfg.taxType23 || !cfg.paymentAccountCode) return "not_mapped";
  const [done] = await withTenant(venue.tenantId, (tx) =>
    tx.select().from(t.xeroSync).where(and(eq(t.xeroSync.venueId, venue.id), eq(t.xeroSync.businessDate, date))),
  );
  if (done && done.status !== "error") return "already";

  const record = (status: "done" | "nothing" | "error", invoiceId: string | null, error: string | null) =>
    withTenant(venue.tenantId, async (tx) => {
      const values = { tenantId: venue.tenantId, venueId: venue.id, businessDate: date, status, invoiceId, error, attempts: (done?.attempts ?? 0) + 1, updatedAt: new Date() };
      await tx.insert(t.xeroSync).values(values).onConflictDoUpdate({ target: [t.xeroSync.venueId, t.xeroSync.businessDate], set: values });
    });

  try {
    const summary = buildDaySummary({ date, venueName: venue.name, ...(await dayOrders(venue, date)) }, cfg);
    if (!summary) {
      await record("nothing", null, null);
      return "nothing";
    }
    const client = new XeroClient(app, fetchImpl);
    let tokens = JSON.parse(decryptSecret(row.secretEnc, secretsKey)) as XeroTokens;
    if (tokens.expiresAt - Date.now() < 120_000) {
      tokens = await client.refresh(tokens.refreshToken);
      // Xero rotates refresh tokens: save the new pair before using it.
      await saveIntegration(venue, "xero", row.config, JSON.stringify(tokens), secretsKey);
    }
    const invoiceId = await client.postDay(tokens, cfg.tenantId, summary, cfg.paymentAccountCode, `complete:${venue.id}:${date}`);
    await record("done", invoiceId, null);
    return "done";
  } catch (e) {
    await record("error", null, String(e).slice(0, 500));
    return "error";
  }
}

export async function xeroHistory(venue: Venue) {
  return withTenant(venue.tenantId, (tx) => tx.select().from(t.xeroSync).where(eq(t.xeroSync.venueId, venue.id)));
}

/** Every venue with Xero connected, for the nightly job. */
export async function venuesWithXero() {
  const rows = await systemDb().select({ venueId: t.venueIntegration.venueId }).from(t.venueIntegration).where(eq(t.venueIntegration.kind, "xero"));
  if (!rows.length) return [];
  return systemDb().select().from(t.venue).where(inArray(t.venue.id, rows.map((r) => r.venueId)));
}
