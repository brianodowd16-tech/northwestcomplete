import { CartError, decryptSecret, localDate, publicHttpsUrl, wooItems, wooPaid, type PartnerBookingInput, type WooOrder } from "@round/core";
import { and, asc, eq, gte, inArray, isNotNull, lt, or } from "drizzle-orm";
import { ringUpDelivery } from "./growth";
import { systemDb, withTenant } from "./index";
import { loadIntegration, saveIntegration, type IntegrationKind } from "./integrations";
import * as t from "./schema";
import type { Venue } from "./services";

/**
 * Partner connections: WooCommerce, Trybe, Mews, Revolut Business, myPOS reports.
 * Each stores its keys as one encrypted JSON secret (never returned to the browser) and plain config.
 */
export type ConnectKind = Extract<IntegrationKind, "woocommerce" | "trybe" | "mews" | "revolut_business" | "mypos_reports">;

/** Saves a connection. Blank secret fields keep what's stored, so managers can change config without re-entering keys. */
export async function saveConnection(venue: Venue, kind: ConnectKind, config: Record<string, unknown>, secrets: Record<string, string>, secretsKey: string) {
  const old = await connection(venue, kind, secretsKey);
  const merged: Record<string, string> = { ...(old?.secrets ?? {}) };
  for (const [k, v] of Object.entries(secrets)) if (v.trim()) merged[k] = v.trim();
  await saveIntegration(venue, kind, config, JSON.stringify(merged), secretsKey);
}

export async function connection<C = Record<string, unknown>>(venue: Venue, kind: ConnectKind, secretsKey: string | undefined): Promise<{ config: C; secrets: Record<string, string> } | null> {
  const row = await loadIntegration(venue, kind);
  if (!row) return null;
  let secrets: Record<string, string> = {};
  if (row.secretEnc && secretsKey) {
    try {
      secrets = JSON.parse(decryptSecret(row.secretEnc, secretsKey));
    } catch {
      secrets = {};
    }
  }
  return { config: row.config as C, secrets };
}

/** Which secret fields are stored (names only), for the settings form. */
export async function connectionStatus(venue: Venue, secretsKey: string | undefined) {
  const out: Partial<Record<ConnectKind, { config: Record<string, unknown>; has: string[] }>> = {};
  for (const k of ["woocommerce", "trybe", "mews", "revolut_business", "mypos_reports"] as ConnectKind[]) {
    const c = await connection(venue, k, secretsKey);
    if (c) out[k] = { config: c.config, has: Object.keys(c.secrets) };
  }
  return out;
}

export function checkStoreUrl(url: string) {
  const u = url.trim().replace(/\/+$/, "");
  if (!publicHttpsUrl(u)) throw new CartError("Enter your shop's public https:// address");
  return u;
}

// ---------------------------------------------------------------- WooCommerce

/**
 * A paid shop order. Lines that match the menu (SKU = the item's external ID, else the name) are rung up
 * like a delivery order: dockets for anything to prepare, stock taken out, in the day's sales.
 * Vouchers and merchandise that aren't on the menu are left to the shop. Idempotent by the shop's order id.
 */
export async function importWooOrder(venue: Venue, o: WooOrder): Promise<"imported" | "repeat" | "not_paid" | "nothing_on_menu"> {
  if (!wooPaid(o)) return "not_paid";
  const items = wooItems(o);
  const name = [o.billing?.first_name, o.billing?.last_name].filter(Boolean).join(" ") || undefined;
  const r = await ringUpDelivery(venue, { platform: "woocommerce", externalId: String(o.id), customerName: name, items }, { skipUnknown: true });
  if (!r.order) return "nothing_on_menu";
  return r.repeat ? "repeat" : "imported";
}

// ---------------------------------------------------------------- Trybe bookings

export async function savePartnerBooking(venue: Venue, b: PartnerBookingInput) {
  await withTenant(venue.tenantId, async (tx) => {
    const values = { tenantId: venue.tenantId, venueId: venue.id, source: "trybe" as const, externalId: b.externalId.slice(0, 80), ref: b.ref?.slice(0, 40) ?? null, status: b.status, guestName: b.guestName.slice(0, 80), email: b.email?.slice(0, 200) ?? null, startsAt: b.startsAt, endsAt: b.endsAt, items: b.items, totalCents: b.totalCents, updatedAt: new Date() };
    await tx.insert(t.partnerBooking).values(values).onConflictDoUpdate({ target: [t.partnerBooking.venueId, t.partnerBooking.source, t.partnerBooking.externalId], set: values });
  });
}

/** Spa and activity bookings for the staff Bookings screen. */
export async function partnerBookings(venue: Venue, from: Date, to: Date) {
  return withTenant(venue.tenantId, (tx) =>
    tx.select().from(t.partnerBooking).where(and(eq(t.partnerBooking.venueId, venue.id), eq(t.partnerBooking.status, "confirmed"), gte(t.partnerBooking.startsAt, from), lt(t.partnerBooking.startsAt, to))).orderBy(asc(t.partnerBooking.startsAt)),
  );
}

/**
 * A guest's own upcoming spa and activity bookings at every venue. Emails aren't verified at sign-up,
 * so a booking shows only when both the email and the first name match.
 */
export async function guestPartnerBookings(email: string, name: string) {
  const e = email.trim().toLowerCase(), first = name.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (!e || !first) return [];
  const rows = await systemDb()
    .select({ id: t.partnerBooking.id, venueName: t.venue.name, venueSlug: t.venue.slug, startsAt: t.partnerBooking.startsAt, items: t.partnerBooking.items, ref: t.partnerBooking.ref, guestName: t.partnerBooking.guestName })
    .from(t.partnerBooking)
    .innerJoin(t.venue, eq(t.venue.id, t.partnerBooking.venueId))
    .where(and(eq(t.partnerBooking.email, e), eq(t.partnerBooking.status, "confirmed"), gte(t.partnerBooking.startsAt, new Date(Date.now() - 3 * 3_600_000))))
    .orderBy(asc(t.partnerBooking.startsAt))
    .limit(10);
  return rows.filter((r) => r.guestName.trim().split(/\s+/)[0]?.toLowerCase() === first).map(({ guestName: _, ...r }) => r);
}

// ---------------------------------------------------------------- card takings for reconciliation

/**
 * One trading day's card money, net of that day's refunds: app payments (myPOS or Revolut online) and
 * till card sales on the venue's myPOS terminal. Tips are included (they're in the card payment).
 */
export async function dayCardTakings(venue: Venue, date: string) {
  const from = new Date(`${date}T00:00:00Z`);
  const lo = new Date(from.getTime() - 86_400_000), hi = new Date(from.getTime() + 2 * 86_400_000);
  const os = await withTenant(venue.tenantId, (tx) =>
    tx.select().from(t.orders).where(and(eq(t.orders.venueId, venue.id), inArray(t.orders.provider, ["mypos", "revolut", "mypos_terminal"]), inArray(t.orders.status, ["paid", "refunded"]), or(and(gte(t.orders.paidAt, lo), lt(t.orders.paidAt, hi)), and(isNotNull(t.orders.refundedAt), gte(t.orders.refundedAt, lo), lt(t.orders.refundedAt, hi))))),
  );
  const sum = { mypos: 0, revolut: 0 };
  for (const o of os) {
    const k = o.provider === "revolut" ? "revolut" : "mypos";
    if (o.paidAt && localDate(o.paidAt, venue.timezone) === date) sum[k] += o.amountPaidCents;
    if (o.refundedAt && localDate(o.refundedAt, venue.timezone) === date) sum[k] -= o.refundedCents;
  }
  return { myposCents: sum.mypos, revolutCents: sum.revolut, totalCents: sum.mypos + sum.revolut };
}

/** An order and its lines (any channel), for posting it to a partner system. */
export async function orderWithLines(venue: Venue, orderId: string) {
  return withTenant(venue.tenantId, async (tx) => {
    const [order] = await tx.select().from(t.orders).where(and(eq(t.orders.id, orderId), eq(t.orders.venueId, venue.id)));
    if (!order) return null;
    return { order, lines: await tx.select().from(t.orderLine).where(eq(t.orderLine.orderId, order.id)) };
  });
}
