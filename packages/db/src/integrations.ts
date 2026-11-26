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
  buildSageDay,
  CartError,
  PAYROLL_FORMATS,
  SAGE_MAPPING_FIELDS,
  SageClient,
  sageMapped,
  BIZIMPLY_DEFAULT_HEADINGS,
  type DeelEnv,
  type DaySales,
  type PayFrequency,
  type PayrollFormat,
  type SageApp,
  type SageMapping,
  type SageTokens,
} from "@round/core";
import { and, eq, gte, inArray, isNotNull, lt, or } from "drizzle-orm";
import { systemDb, withTenant } from "./index";
import * as t from "./schema";
import { Forbidden, NotFound, type Venue } from "./services";

export type IntegrationKind = "revolut" | "mypos" | "xero" | "delivery" | "pms" | "sage" | "payroll" | "deel" | "bizimply" | "meta" | "google_business" | "social";

export async function loadIntegration(venue: Venue, kind: IntegrationKind) {
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
      // Tips belong to the staff, not sales: they're left out of the sales payment (the venue pays them out).
      amountPaidCents: o.provider === "cash" || o.provider === "room" ? 0 : o.amountPaidCents - o.tipCents,
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
    tx.select().from(t.xeroSync).where(and(eq(t.xeroSync.venueId, venue.id), eq(t.xeroSync.target, "xero"), eq(t.xeroSync.businessDate, date))),
  );
  if (done && done.status !== "error") return "already";

  const record = (status: "done" | "nothing" | "error", invoiceId: string | null, error: string | null) => recordSync(venue, "xero", date, status, invoiceId, error);

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
  return syncHistory(venue, "xero");
}

/** Every venue with Xero connected, for the nightly job. */
export function venuesWithXero() {
  return venuesWith("xero");
}

// ---------------------------------------------------------------- sync records (Xero, Sage, payroll)

export type SyncTarget = "xero" | "sage" | "payroll" | "deel" | "bizimply";

/** Records one day (or pay period) sent to an outside system, counting attempts. */
export async function recordSync(venue: Venue, target: SyncTarget, date: string, status: "done" | "nothing" | "error", ref: string | null, error: string | null) {
  await withTenant(venue.tenantId, async (tx) => {
    const [prev] = await tx.select().from(t.xeroSync).where(and(eq(t.xeroSync.venueId, venue.id), eq(t.xeroSync.target, target), eq(t.xeroSync.businessDate, date)));
    const values = { tenantId: venue.tenantId, venueId: venue.id, target, businessDate: date, status, invoiceId: ref, error, attempts: (prev?.attempts ?? 0) + 1, updatedAt: new Date() };
    await tx.insert(t.xeroSync).values(values).onConflictDoUpdate({ target: [t.xeroSync.venueId, t.xeroSync.target, t.xeroSync.businessDate], set: values });
  });
}

export async function syncHistory(venue: Venue, target: SyncTarget) {
  return withTenant(venue.tenantId, (tx) => tx.select().from(t.xeroSync).where(and(eq(t.xeroSync.venueId, venue.id), eq(t.xeroSync.target, target))));
}

export async function syncDone(venue: Venue, target: SyncTarget, date: string) {
  const [row] = await withTenant(venue.tenantId, (tx) =>
    tx.select().from(t.xeroSync).where(and(eq(t.xeroSync.venueId, venue.id), eq(t.xeroSync.target, target), eq(t.xeroSync.businessDate, date))),
  );
  return !!row && row.status !== "error";
}

/** Every venue with one integration set up, for the scheduled jobs. */
export async function venuesWith(kind: IntegrationKind) {
  const rows = await systemDb().select({ venueId: t.venueIntegration.venueId }).from(t.venueIntegration).where(eq(t.venueIntegration.kind, kind));
  if (!rows.length) return [];
  return systemDb().select().from(t.venue).where(inArray(t.venue.id, rows.map((r) => r.venueId)));
}

// ---------------------------------------------------------------- Sage Accounting

export interface SageConfig extends Partial<SageMapping> {
  businessId: string;
  businessName: string;
}

/** Called from the Sage OAuth callback: stores tokens and the venue's Sage business. */
export async function connectSage(venue: Venue, app: SageApp, code: string, secretsKey: string, fetchImpl?: typeof fetch) {
  const client = new SageClient(app, fetchImpl);
  const tokens = await client.exchangeCode(code);
  const [biz] = await client.businesses(tokens.accessToken);
  if (!biz) throw new Error("No Sage business was connected");
  const existing = (await loadIntegration(venue, "sage"))?.config ?? {};
  await saveIntegration(venue, "sage", { ...existing, businessId: biz.id, businessName: biz.name }, JSON.stringify(tokens), secretsKey);
  return biz.name;
}

/** A fresh Sage access token; rotated refresh tokens are saved before use. */
async function sageSession(venue: Venue, app: SageApp, secretsKey: string, fetchImpl?: typeof fetch) {
  const row = await loadIntegration(venue, "sage");
  if (!row?.secretEnc) return null;
  const client = new SageClient(app, fetchImpl);
  let tokens = JSON.parse(decryptSecret(row.secretEnc, secretsKey)) as SageTokens;
  if (tokens.expiresAt - Date.now() < 120_000) {
    tokens = await client.refresh(tokens.refreshToken);
    await saveIntegration(venue, "sage", row.config, JSON.stringify(tokens), secretsKey);
  }
  return { client, token: tokens.accessToken, cfg: row.config as unknown as SageConfig };
}

/** Customers, ledgers, tax rates and bank accounts from the venue's Sage business, for the mapping form. */
export async function sageOptions(venue: Venue, app: SageApp, secretsKey: string, fetchImpl?: typeof fetch) {
  const s = await sageSession(venue, app, secretsKey, fetchImpl);
  if (!s) throw new NotFound("Connect Sage first");
  return s.client.options(s.token, s.cfg.businessId);
}

export async function saveSageMapping(venue: Venue, mapping: Partial<SageMapping>) {
  const existing = await loadIntegration(venue, "sage");
  if (!existing) throw new NotFound("Connect Sage first");
  const clean = Object.fromEntries(SAGE_MAPPING_FIELDS.map((k) => [k, String(mapping[k] ?? "").trim().slice(0, 64)]));
  await withTenant(venue.tenantId, (tx) =>
    tx.update(t.venueIntegration).set({ config: { ...existing.config, ...clean }, updatedAt: new Date() }).where(eq(t.venueIntegration.id, existing.id)),
  );
}

/** Pushes one trading day to Sage. Safe to repeat: done days are skipped and Sage is checked for the day's invoice first. */
export async function syncSageDay(venue: Venue, date: string, app: SageApp, secretsKey: string, fetchImpl?: typeof fetch): Promise<XeroSyncResult> {
  const row = await loadIntegration(venue, "sage");
  if (!row?.secretEnc) return "not_connected";
  if (!sageMapped(row.config as Partial<SageMapping>)) return "not_mapped";
  if (await syncDone(venue, "sage", date)) return "already";
  try {
    const day = buildSageDay({ date, venueName: venue.name, ...(await dayOrders(venue, date)) }, row.config as unknown as SageMapping, venue.id);
    if (!day) {
      await recordSync(venue, "sage", date, "nothing", null, null);
      return "nothing";
    }
    const s = (await sageSession(venue, app, secretsKey, fetchImpl))!;
    const id = await s.client.postDay(s.token, s.cfg.businessId, day, s.cfg as SageMapping);
    await recordSync(venue, "sage", date, "done", id, null);
    return "done";
  } catch (e) {
    await recordSync(venue, "sage", date, "error", null, String(e).slice(0, 500));
    return "error";
  }
}

// ---------------------------------------------------------------- payroll delivery

export interface PayrollSyncConfig {
  mode: "email" | "webhook";
  email: string;
  url: string;
  format: PayrollFormat;
  frequency: PayFrequency;
  /** first Monday of a fortnightly pay period */
  anchor: string;
}

/** Where each closed pay period is sent: the payroll bureau's email, or an https endpoint (signed). */
export async function savePayrollSync(venue: Venue, input: Partial<PayrollSyncConfig>, secret: string | null, secretsKey: string) {
  const mode = input.mode === "webhook" ? "webhook" : "email";
  const email = String(input.email ?? "").trim().toLowerCase();
  const url = String(input.url ?? "").trim();
  const format = (input.format && input.format in PAYROLL_FORMATS ? input.format : "generic") as PayrollFormat;
  const frequency: PayFrequency = input.frequency === "fortnightly" || input.frequency === "monthly" ? input.frequency : "weekly";
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(String(input.anchor ?? "")) ? String(input.anchor) : "";
  if (mode === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new CartError("Enter the email address of whoever runs your payroll");
  if (mode === "webhook" && !/^https:\/\/[^\s]+$/.test(url)) throw new CartError("Enter an https:// address");
  if (frequency === "fortnightly" && (!anchor || new Date(`${anchor}T12:00:00Z`).getUTCDay() !== 1)) throw new CartError("Pick the Monday a fortnightly pay period starts");
  const existing = await loadIntegration(venue, "payroll");
  await saveIntegration(venue, "payroll", { mode, email, url, format, frequency, anchor }, secret ?? (existing?.secretEnc ? null : ""), secretsKey);
}

export async function payrollSyncConfig(venue: Venue) {
  const row = await loadIntegration(venue, "payroll");
  return row ? { config: row.config as unknown as PayrollSyncConfig, secret: row.secretEnc } : null;
}

export async function payrollPeriodDone(venue: Venue, start: string) {
  return syncDone(venue, "payroll", start);
}


// ---------------------------------------------------------------- Deel

export interface DeelConfig {
  env: DeelEnv;
  frequency: PayFrequency;
  anchor: string;
  /** Deel adjustment categories for payroll (GP/EOR) staff */
  payCategoryId: string;
  tipsCategoryId: string;
  /** staff id -> Deel contract id, where email or external_id don't match */
  manual: Record<string, string>;
}

/** Saves Deel settings; `token` (an organisation API token) replaces the stored one when given. */
export async function saveDeel(venue: Venue, input: Partial<DeelConfig>, token: string | null, secretsKey: string) {
  const existing = await loadIntegration(venue, "deel");
  if (!existing?.secretEnc && !token) throw new CartError("Paste your Deel API token");
  if (token !== null && !/^[\w.\-~+/=]{20,}$/.test(token)) throw new CartError("That doesn't look like a Deel API token");
  const prev = (existing?.config ?? {}) as Partial<DeelConfig>;
  const frequency: PayFrequency = input.frequency === "fortnightly" || input.frequency === "monthly" ? input.frequency : input.frequency === "weekly" ? "weekly" : prev.frequency ?? "weekly";
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(String(input.anchor ?? "")) ? String(input.anchor) : prev.anchor ?? "";
  if (frequency === "fortnightly" && (!anchor || new Date(`${anchor}T12:00:00Z`).getUTCDay() !== 1)) throw new CartError("Pick the Monday a fortnightly pay period starts");
  const clean = (v: unknown, fallback = "") => (v === undefined ? fallback : String(v).trim().slice(0, 64));
  const config: DeelConfig = {
    env: input.env === "sandbox" ? "sandbox" : input.env === "production" ? "production" : prev.env ?? "production",
    frequency,
    anchor,
    payCategoryId: clean(input.payCategoryId, prev.payCategoryId ?? ""),
    tipsCategoryId: clean(input.tipsCategoryId, prev.tipsCategoryId ?? ""),
    manual: Object.fromEntries(Object.entries(input.manual ?? prev.manual ?? {}).filter(([, v]) => !!v).map(([k, v]) => [k, String(v).slice(0, 64)])),
  };
  await saveIntegration(venue, "deel", config as unknown as Record<string, unknown>, token, secretsKey);
}

export async function deelSettings(venue: Venue, secretsKey: string | undefined) {
  const row = await loadIntegration(venue, "deel");
  if (!row?.secretEnc || !secretsKey) return null;
  return { config: row.config as unknown as DeelConfig, token: decryptSecret(row.secretEnc, secretsKey) };
}

// ---------------------------------------------------------------- Bizimply

export interface BizimplyConfig {
  host: string;
  port: number;
  username: string;
  dir: string;
  /** the venue's location name exactly as in Bizimply */
  location: string;
  headings: string[];
}

/** Saves the SFTP folder Bizimply collects sales from; `password` replaces the stored one when given. */
export async function saveBizimply(venue: Venue, input: Partial<Omit<BizimplyConfig, "headings">> & { headings?: string[] | string }, password: string | null, secretsKey: string) {
  const host = String(input.host ?? "").trim().toLowerCase();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) throw new CartError("Enter the SFTP server name Bizimply gave you (like sftp.example.com)");
  const port = Number(input.port || 22);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new CartError("Port must be a number, usually 22");
  const username = String(input.username ?? "").trim();
  if (!username) throw new CartError("Enter the SFTP username");
  const location = String(input.location ?? "").trim() || venue.name;
  const raw = Array.isArray(input.headings) ? input.headings : String(input.headings ?? "").split(",");
  const headings = raw.map((h) => h.trim()).filter(Boolean);
  const existing = await loadIntegration(venue, "bizimply");
  if (!existing?.secretEnc && !password) throw new CartError("Enter the SFTP password");
  const config: BizimplyConfig = { host, port, username, dir: String(input.dir ?? "").trim().replace(/\/+$/, "") || ".", location: location.slice(0, 80), headings: headings.length === 5 ? headings : [...BIZIMPLY_DEFAULT_HEADINGS] };
  await saveIntegration(venue, "bizimply", config as unknown as Record<string, unknown>, password, secretsKey);
}

export async function bizimplySettings(venue: Venue, secretsKey: string | undefined) {
  const row = await loadIntegration(venue, "bizimply");
  if (!row?.secretEnc || !secretsKey) return null;
  return { config: row.config as unknown as BizimplyConfig, password: decryptSecret(row.secretEnc, secretsKey) };
}

/** One trading day's sales across every channel (app, till, delivery), after that day's refunds. */
export async function daySales(venue: Venue, date: string): Promise<DaySales> {
  const from = new Date(`${date}T00:00:00Z`);
  const lo = new Date(from.getTime() - 86_400_000), hi = new Date(from.getTime() + 2 * 86_400_000);
  return withTenant(venue.tenantId, async (tx) => {
    const os = await tx
      .select()
      .from(t.orders)
      .where(and(eq(t.orders.venueId, venue.id), inArray(t.orders.status, ["paid", "refunded"]), or(and(gte(t.orders.paidAt, lo), lt(t.orders.paidAt, hi)), and(isNotNull(t.orders.refundedAt), gte(t.orders.refundedAt, lo), lt(t.orders.refundedAt, hi)))));
    const paid = os.filter((o) => o.paidAt && localDate(o.paidAt, venue.timezone) === date);
    const refunded = os.filter((o) => o.refundedAt && localDate(o.refundedAt, venue.timezone) === date);
    const ids = [...new Set([...paid, ...refunded].map((o) => o.id))];
    const lines = ids.length ? await tx.select().from(t.orderLine).where(inArray(t.orderLine.orderId, ids)) : [];
    const sum = (set: typeof os, f: (l: (typeof lines)[number]) => number) => set.reduce((s, o) => s + lines.filter((l) => l.orderId === o.id).reduce((a, l) => a + f(l), 0), 0);
    return {
      grossCents: sum(paid, (l) => l.grossCents) - sum(refunded, (l) => l.grossCents),
      vatCents: sum(paid, (l) => l.vatCents) - sum(refunded, (l) => l.vatCents),
      tipsCents: paid.reduce((s, o) => s + o.tipCents, 0) - refunded.reduce((s, o) => s + o.tipCents, 0),
      transactions: paid.length,
    };
  });
}
