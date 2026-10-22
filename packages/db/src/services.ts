import {
  ageOn,
  assertCanAdvance,
  balances,
  buildStatement,
  convertPoints,
  creditToApply,
  hashOtp,
  levelFor,
  newOtp,
  nextLevel,
  priceCart,
  reverseEntries,
  settleOrder,
  signupEntries,
  splitByStation,
  type Channel,
  type DocketStatus,
  type LedgerEntry,
  type PaymentProvider,
  type PricedMenuItem,
  type Station,
} from "@round/core";
import { and, asc, desc, eq, gte, inArray, lt, ne, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { publish, systemDb, topics, withTenant, type Tx } from "./index";
import * as t from "./schema";

export class NotFound extends Error {}
export class Forbidden extends Error {}

// ---------------------------------------------------------------- venues

export type Venue = typeof t.venue.$inferSelect;

/** Platform lookup (no tenant yet): slug → venue. */
export async function venueBySlug(slug: string): Promise<Venue> {
  const [v] = await systemDb().select().from(t.venue).where(eq(t.venue.slug, slug));
  if (!v) throw new NotFound("Venue not found");
  return v;
}

export async function venueById(id: string): Promise<Venue> {
  const [v] = await systemDb().select().from(t.venue).where(eq(t.venue.id, id));
  if (!v) throw new NotFound("Venue not found");
  return v;
}

export async function allVenues() {
  return systemDb().select().from(t.venue).orderBy(asc(t.venue.name));
}

export async function tableByToken(venue: Venue, qrToken: string) {
  return withTenant(venue.tenantId, async (tx) => {
    const [row] = await tx
      .select()
      .from(t.venueTable)
      .where(and(eq(t.venueTable.venueId, venue.id), eq(t.venueTable.qrToken, qrToken), eq(t.venueTable.active, true)));
    if (!row) throw new NotFound("Table not found");
    return row;
  });
}

export async function venueTables(venue: Venue) {
  return withTenant(venue.tenantId, (tx) =>
    tx.select().from(t.venueTable).where(eq(t.venueTable.venueId, venue.id)).orderBy(asc(t.venueTable.number)),
  );
}

// ---------------------------------------------------------------- menu

function toPriced(m: typeof t.menuItem.$inferSelect): PricedMenuItem {
  return {
    id: m.id,
    name: m.name,
    priceCents: m.priceCents,
    vatRate: m.vatRate,
    station: m.station,
    containsAlcohol: m.containsAlcohol,
    availableForCollect: m.availableForCollect,
    active: m.active,
    soldOut: m.soldOut,
    externalItemId: m.externalItemId,
  };
}

export async function menu(venue: Venue) {
  return withTenant(venue.tenantId, async (tx) => {
    const cats = await tx.select().from(t.menuCategory).where(eq(t.menuCategory.venueId, venue.id)).orderBy(asc(t.menuCategory.sort));
    const items = await tx
      .select()
      .from(t.menuItem)
      .where(and(eq(t.menuItem.venueId, venue.id), eq(t.menuItem.active, true)))
      .orderBy(asc(t.menuItem.sort));
    return cats.map((c) => ({ ...c, items: items.filter((i) => i.categoryId === c.id) })).filter((c) => c.items.length);
  });
}

export async function setSoldOut(venue: Venue, itemId: string, soldOut: boolean) {
  await withTenant(venue.tenantId, async (tx) => {
    const res = await tx
      .update(t.menuItem)
      .set({ soldOut })
      .where(and(eq(t.menuItem.id, itemId), eq(t.menuItem.venueId, venue.id)))
      .returning({ id: t.menuItem.id });
    if (!res.length) throw new NotFound("Item not found");
    await publish(tx, topics.venue(venue.id), { kind: "menu" });
  });
}

// ---------------------------------------------------------------- guest auth

export type Customer = typeof t.customer.$inferSelect;

const OTP_TTL_MS = 10 * 60_000;
const OTP_MAX_ATTEMPTS = 5;

/** Creates a one-time code. Returns it so the caller can send it by SMS (or show it in dev). */
export async function requestOtp(phone: string, secret: string): Promise<string> {
  const code = newOtp();
  const row = { phone, codeHash: hashOtp(phone, code, secret), expiresAt: new Date(Date.now() + OTP_TTL_MS), attempts: 0 };
  await systemDb().insert(t.otpCode).values(row).onConflictDoUpdate({ target: t.otpCode.phone, set: row });
  return code;
}

export async function verifyOtp(phone: string, code: string, secret: string): Promise<boolean> {
  const db = systemDb();
  const [row] = await db.select().from(t.otpCode).where(eq(t.otpCode.phone, phone));
  if (!row || row.expiresAt < new Date() || row.attempts >= OTP_MAX_ATTEMPTS) return false;
  if (row.codeHash !== hashOtp(phone, code, secret)) {
    await db.update(t.otpCode).set({ attempts: row.attempts + 1 }).where(eq(t.otpCode.phone, phone));
    return false;
  }
  await db.delete(t.otpCode).where(eq(t.otpCode.phone, phone));
  return true;
}

export async function customerByPhone(phone: string) {
  const [c] = await systemDb().select().from(t.customer).where(eq(t.customer.phone, phone));
  return c ?? null;
}

export async function customerById(id: string) {
  const [c] = await systemDb().select().from(t.customer).where(eq(t.customer.id, id));
  return c ?? null;
}

export class SignupError extends Error {}

export async function createCustomer(input: { phone: string; name: string; email: string; dateOfBirth: string; marketingConsent: boolean }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dateOfBirth)) throw new SignupError("Enter your date of birth");
  if (ageOn(input.dateOfBirth, new Date()) < 18) throw new SignupError("You must be 18 or over to use Round");
  if (!input.name.trim()) throw new SignupError("Enter your name");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email)) throw new SignupError("Enter a valid email for receipts");
  const [c] = await systemDb()
    .insert(t.customer)
    .values({ ...input, name: input.name.trim(), email: input.email.trim() })
    .returning();
  return c;
}

// ---------------------------------------------------------------- loyalty

async function programmeFor(tx: Tx, programmeId: string) {
  const [programme] = await tx.select().from(t.programme).where(eq(t.programme.id, programmeId));
  const levels = await tx.select().from(t.programmeLevel).where(eq(t.programmeLevel.programmeId, programmeId));
  return { programme, levels };
}

async function ensureMembershipTx(tx: Tx, venue: Venue, customerId: string) {
  const [existing] = await tx
    .select()
    .from(t.membership)
    .where(and(eq(t.membership.programmeId, venue.programmeId), eq(t.membership.customerId, customerId)));
  if (existing) return existing;
  const { programme } = await programmeFor(tx, venue.programmeId);
  const [m] = await tx
    .insert(t.membership)
    .values({ tenantId: venue.tenantId, programmeId: venue.programmeId, customerId, referralCode: randomBytes(4).toString("hex").toUpperCase() })
    .returning();
  await writeLedger(tx, venue.tenantId, m.id, signupEntries(programme));
  return m;
}

export async function ensureMembership(venue: Venue, customerId: string) {
  return withTenant(venue.tenantId, (tx) => ensureMembershipTx(tx, venue, customerId));
}

async function writeLedger(tx: Tx, tenantId: string, membershipId: string, entries: LedgerEntry[]) {
  if (!entries.length) return;
  await tx.insert(t.loyaltyLedger).values(entries.map((e) => ({ tenantId, membershipId, kind: e.kind, delta: e.delta, reason: e.reason, orderId: e.orderId ?? null })));
}

async function ledgerBalances(tx: Tx, membershipId: string) {
  const rows = await tx.select({ kind: t.loyaltyLedger.kind, delta: t.loyaltyLedger.delta }).from(t.loyaltyLedger).where(eq(t.loyaltyLedger.membershipId, membershipId));
  return balances(rows);
}

async function spend12m(tx: Tx, membershipId: string, excludeOrderId?: string) {
  const since = new Date(Date.now() - 365 * 86_400_000);
  const [row] = await tx
    .select({ total: sql<number>`coalesce(sum(${t.orders.amountPaidCents} - ${t.orders.refundedCents}), 0)::int` })
    .from(t.orders)
    .where(
      and(
        eq(t.orders.membershipId, membershipId),
        eq(t.orders.status, "paid"),
        gte(t.orders.paidAt, since),
        excludeOrderId ? ne(t.orders.id, excludeOrderId) : undefined,
      ),
    );
  return row.total;
}

const toLevel = (l: typeof t.programmeLevel.$inferSelect) => ({
  name: l.name,
  minSpend12mCents: l.minSpend12mCents,
  levelupPoints: l.levelupPoints,
  doublePointsCount: l.doublePointsCount,
  birthdayCreditCents: l.birthdayCreditCents,
});

export async function memberSummary(venue: Venue, customerId: string) {
  return withTenant(venue.tenantId, async (tx) => {
    const m = await ensureMembershipTx(tx, venue, customerId);
    const { programme, levels } = await programmeFor(tx, venue.programmeId);
    const lv = levels.map(toLevel).sort((a, b) => a.minSpend12mCents - b.minSpend12mCents);
    const spend = await spend12m(tx, m.id);
    const history = await tx.select().from(t.loyaltyLedger).where(eq(t.loyaltyLedger.membershipId, m.id)).orderBy(desc(t.loyaltyLedger.createdAt)).limit(20);
    return {
      membership: m,
      programme,
      levels: lv,
      balances: await ledgerBalances(tx, m.id),
      spend12mCents: spend,
      level: levelFor(lv, spend),
      next: nextLevel(lv, spend),
      history,
    };
  });
}

export async function convertMemberPoints(venue: Venue, customerId: string, points: number) {
  return withTenant(venue.tenantId, async (tx) => {
    const m = await ensureMembershipTx(tx, venue, customerId);
    // Lock the membership so two conversions can't spend the same points.
    await tx.execute(sql`select 1 from membership where id = ${m.id} for update`);
    const { programme } = await programmeFor(tx, venue.programmeId);
    const b = await ledgerBalances(tx, m.id);
    await writeLedger(tx, venue.tenantId, m.id, convertPoints(programme, b.points, points));
  });
}

// ---------------------------------------------------------------- orders

export interface CreateOrderInput {
  venue: Venue;
  customer: Customer;
  channel: Channel;
  tableId: string | null;
  lines: { menuItemId: string; qty: number }[];
  creditRequestedCents: number;
  useDouble: boolean;
  idempotencyKey: string;
}

export type Order = typeof t.orders.$inferSelect;

export async function createOrder(input: CreateOrderInput, provider: PaymentProvider): Promise<Order> {
  const { venue, customer } = input;
  if (input.channel === "table" && !input.tableId) throw new Forbidden("Table required");

  const created = await withTenant(venue.tenantId, async (tx) => {
    const [dupe] = await tx.select().from(t.orders).where(eq(t.orders.idempotencyKey, input.idempotencyKey));
    if (dupe) return { order: dupe, isNew: false };

    if (input.tableId) {
      const [tbl] = await tx.select().from(t.venueTable).where(and(eq(t.venueTable.id, input.tableId), eq(t.venueTable.venueId, venue.id)));
      if (!tbl) throw new Forbidden("Unknown table");
    }
    const m = await ensureMembershipTx(tx, venue, customer.id);
    await tx.execute(sql`select 1 from membership where id = ${m.id} for update`);
    const items = await tx.select().from(t.menuItem).where(eq(t.menuItem.venueId, venue.id));
    const cart = priceCart(new Map(items.map((i) => [i.id, toPriced(i)])), input.lines, input.channel);
    const b = await ledgerBalances(tx, m.id);
    const credit = creditToApply(input.creditRequestedCents, b.creditCents, cart.grossCents);

    const [order] = await tx
      .insert(t.orders)
      .values({
        tenantId: venue.tenantId,
        venueId: venue.id,
        channel: input.channel,
        tableId: input.tableId,
        customerId: customer.id,
        membershipId: m.id,
        status: "pending_payment",
        grossCents: cart.grossCents,
        vat9Cents: cart.vat9Cents,
        vat23Cents: cart.vat23Cents,
        creditUsedCents: credit,
        amountPaidCents: cart.grossCents - credit,
        useDouble: input.useDouble && b.doubles > 0,
        provider: provider.name,
        idempotencyKey: input.idempotencyKey,
      })
      .returning();
    await tx.insert(t.orderLine).values(
      cart.lines.map((l) => ({
        tenantId: venue.tenantId,
        orderId: order.id,
        menuItemId: l.menuItem.id,
        name: l.menuItem.name,
        qty: l.qty,
        unitPriceCents: l.unitPriceCents,
        grossCents: l.grossCents,
        vatRate: l.vatRate,
        vatCents: l.vatCents,
        station: l.menuItem.station,
        containsAlcohol: l.menuItem.containsAlcohol,
      })),
    );
    return { order, isNew: true, cart };
  });

  if (!created.isNew) return created.order;
  const order = created.order;

  if (order.amountPaidCents === 0) {
    await completeOrder(venue.tenantId, order.id);
    return (await getOrderRow(venue, order.id))!;
  }

  const p = await provider.createOrder({
    amountCents: order.amountPaidCents,
    currency: "EUR",
    reference: order.id,
    description: `${venue.name} order #${order.number}`,
    customerEmail: customer.email,
    // Revolut requires line totals to add up to the order amount, so line items are
    // left off when loyalty credit reduces the charge (SPEC §9).
    lineItems:
      order.creditUsedCents > 0
        ? []
        : created.cart!.lines.map((l) => ({
            name: l.menuItem.name,
            quantity: l.qty,
            unitPriceCents: l.unitPriceCents,
            totalCents: l.grossCents,
            externalId: l.menuItem.externalItemId,
          })),
  });
  return withTenant(venue.tenantId, async (tx) => {
    const [u] = await tx
      .update(t.orders)
      .set({ providerOrderId: p.providerOrderId, providerToken: p.token })
      .where(eq(t.orders.id, order.id))
      .returning();
    return u;
  });
}

async function getOrderRow(venue: Venue, orderId: string) {
  return withTenant(venue.tenantId, async (tx) => {
    const [o] = await tx.select().from(t.orders).where(eq(t.orders.id, orderId));
    return o ?? null;
  });
}

/**
 * Marks an order paid and releases it: dockets, loyalty. Idempotent: only the
 * first call moves pending_payment → paid; later calls (duplicate or
 * out-of-order webhooks, reconciliation) are no-ops and return false.
 */
export async function completeOrder(tenantId: string, orderId: string): Promise<boolean> {
  return withTenant(tenantId, async (tx) => {
    const [order] = await tx
      .update(t.orders)
      .set({ status: "paid", paidAt: new Date() })
      .where(and(eq(t.orders.id, orderId), eq(t.orders.status, "pending_payment")))
      .returning();
    if (!order) return false;

    const lines = await tx.select().from(t.orderLine).where(eq(t.orderLine.orderId, order.id));
    const [cust] = await tx.select().from(t.customer).where(eq(t.customer.id, order.customerId));
    const byStation = new Map<Station, typeof lines>();
    for (const l of lines) byStation.set(l.station, [...(byStation.get(l.station) ?? []), l]);
    for (const [station, ls] of byStation) {
      await tx.insert(t.docket).values({
        tenantId,
        venueId: order.venueId,
        orderId: order.id,
        station,
        idCheckRequired: station === "bar" && ls.some((l) => l.containsAlcohol) && !cust.ageVerifiedAt,
      });
    }

    await tx.execute(sql`select 1 from membership where id = ${order.membershipId} for update`);
    const [m] = await tx.select().from(t.membership).where(eq(t.membership.id, order.membershipId));
    const { programme, levels } = await programmeFor(tx, m.programmeId);
    const entries = settleOrder({
      orderId: order.id,
      rules: programme,
      levels: levels.map(toLevel),
      spend12mBeforeCents: await spend12m(tx, m.id, order.id),
      amountPaidCents: order.amountPaidCents,
      creditUsedCents: order.creditUsedCents,
      useDouble: order.useDouble,
      balancesBefore: await ledgerBalances(tx, m.id),
    });
    await writeLedger(tx, tenantId, m.id, entries);
    await maybeAwardReferral(tx, tenantId, m, programme.referralPoints, order.id);

    await publish(tx, topics.venue(order.venueId), { kind: "dockets" });
    await publish(tx, topics.order(order.id), { kind: "order" });
    return true;
  });
}

async function maybeAwardReferral(tx: Tx, tenantId: string, m: typeof t.membership.$inferSelect, points: number, orderId: string) {
  if (!m.referredByMembershipId || points <= 0) return;
  const [{ n }] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(t.orders)
    .where(and(eq(t.orders.membershipId, m.id), eq(t.orders.status, "paid")));
  if (n !== 1) return;
  await writeLedger(tx, tenantId, m.id, [{ kind: "points", delta: points, reason: "referral", orderId }]);
  await writeLedger(tx, tenantId, m.referredByMembershipId, [{ kind: "points", delta: points, reason: "referral", orderId }]);
}

// ---------------------------------------------------------------- webhooks

export type WebhookResult = { status: 200 | 401 | 400; body: string };

export async function handleWebhook(provider: PaymentProvider, rawBody: string, headers: Headers): Promise<WebhookResult> {
  const db = systemDb();
  const valid = provider.verifyWebhook(rawBody, headers);
  let parsed: { event: string; providerOrderId: string } | null = null;
  try {
    parsed = provider.parseWebhook(rawBody);
  } catch {
    // stored below with event = null
  }
  const [stored] = await db
    .insert(t.webhookEvent)
    .values({ provider: provider.name, raw: rawBody, signatureValid: valid, event: parsed?.event, providerOrderId: parsed?.providerOrderId })
    .returning();
  if (!valid) return { status: 401, body: "bad signature" };
  if (!parsed) return { status: 400, body: "malformed" };

  try {
    if (parsed.event === "ORDER_COMPLETED") {
      const [order] = await db.select().from(t.orders).where(eq(t.orders.providerOrderId, parsed.providerOrderId));
      if (order) {
        // Don't trust event order: ask the provider for the order's current state.
        const { state } = await provider.getOrder(parsed.providerOrderId);
        if (state === "completed") await completeOrder(order.tenantId, order.id);
      }
    }
    await db.update(t.webhookEvent).set({ processedAt: new Date() }).where(eq(t.webhookEvent.id, stored.id));
    return { status: 200, body: "ok" };
  } catch (e) {
    await db.update(t.webhookEvent).set({ error: String(e) }).where(eq(t.webhookEvent.id, stored.id));
    throw e;
  }
}

/** Settles orders whose webhook never arrived. Run every minute. */
export async function reconcilePending(provider: PaymentProvider, olderThanMs = 3 * 60_000) {
  const stale = await systemDb()
    .select()
    .from(t.orders)
    .where(and(eq(t.orders.status, "pending_payment"), lt(t.orders.createdAt, new Date(Date.now() - olderThanMs))));
  let settled = 0;
  for (const o of stale) {
    if (!o.providerOrderId) continue;
    const { state } = await provider.getOrder(o.providerOrderId);
    if (state === "completed" && (await completeOrder(o.tenantId, o.id))) settled++;
    if (state === "cancelled" || state === "failed") {
      await withTenant(o.tenantId, (tx) =>
        tx.update(t.orders).set({ status: "cancelled" }).where(and(eq(t.orders.id, o.id), eq(t.orders.status, "pending_payment"))),
      );
    }
  }
  return settled;
}

// ---------------------------------------------------------------- guest order view

export async function orderForCustomer(venue: Venue, orderId: string, customerId: string) {
  return withTenant(venue.tenantId, async (tx) => {
    const [o] = await tx.select().from(t.orders).where(and(eq(t.orders.id, orderId), eq(t.orders.customerId, customerId)));
    if (!o) throw new NotFound("Order not found");
    const lines = await tx.select().from(t.orderLine).where(eq(t.orderLine.orderId, o.id));
    const dockets = await tx.select().from(t.docket).where(eq(t.docket.orderId, o.id));
    const [tbl] = o.tableId ? await tx.select().from(t.venueTable).where(eq(t.venueTable.id, o.tableId)) : [];
    const points = await tx
      .select({ total: sql<number>`coalesce(sum(${t.loyaltyLedger.delta}), 0)::int` })
      .from(t.loyaltyLedger)
      .where(and(eq(t.loyaltyLedger.orderId, o.id), eq(t.loyaltyLedger.kind, "points")));
    return { order: o, lines, dockets, tableNumber: tbl?.number ?? null, pointsEarned: points[0].total };
  });
}

export async function recentOrdersForCustomer(venue: Venue, customerId: string) {
  return withTenant(venue.tenantId, (tx) =>
    tx
      .select()
      .from(t.orders)
      .where(and(eq(t.orders.venueId, venue.id), eq(t.orders.customerId, customerId), ne(t.orders.status, "pending_payment")))
      .orderBy(desc(t.orders.createdAt))
      .limit(5),
  );
}

// ---------------------------------------------------------------- staff

export type Staff = typeof t.staffUser.$inferSelect;

export async function staffByEmail(email: string) {
  const [s] = await systemDb().select().from(t.staffUser).where(eq(t.staffUser.email, email.toLowerCase().trim()));
  return s ?? null;
}

export async function staffById(id: string) {
  const [s] = await systemDb().select().from(t.staffUser).where(eq(t.staffUser.id, id));
  return s ?? null;
}

export async function stationDockets(staff: Staff, station: Station) {
  return withTenant(staff.tenantId, async (tx) => {
    const since = new Date(Date.now() - 12 * 3_600_000);
    const ds = await tx
      .select()
      .from(t.docket)
      .where(and(eq(t.docket.venueId, staff.venueId), eq(t.docket.station, station), gte(t.docket.createdAt, since)))
      .orderBy(asc(t.docket.createdAt));
    if (!ds.length) return [];
    const orderIds = ds.map((d) => d.orderId);
    const os = await tx.select().from(t.orders).where(inArray(t.orders.id, orderIds));
    const ls = await tx.select().from(t.orderLine).where(and(inArray(t.orderLine.orderId, orderIds), eq(t.orderLine.station, station)));
    const tables = await tx.select().from(t.venueTable).where(eq(t.venueTable.venueId, staff.venueId));
    const custs = await tx.select().from(t.customer).where(inArray(t.customer.id, os.map((o) => o.customerId)));
    const now = new Date();
    return ds.map((d) => {
      const o = os.find((x) => x.id === d.orderId)!;
      const c = custs.find((x) => x.id === o.customerId)!;
      return {
        ...d,
        orderNumber: o.number,
        channel: o.channel,
        orderStatus: o.status,
        tableNumber: tables.find((x) => x.id === o.tableId)?.number ?? null,
        guestFirstName: c.name.split(" ")[0],
        guestAge: ageOn(c.dateOfBirth, now),
        lines: ls.filter((l) => l.orderId === d.orderId).map((l) => ({ name: l.name, qty: l.qty, containsAlcohol: l.containsAlcohol })),
      };
    });
  });
}

async function docketForStaff(tx: Tx, staff: Staff, docketId: string) {
  const [d] = await tx.select().from(t.docket).where(and(eq(t.docket.id, docketId), eq(t.docket.venueId, staff.venueId)));
  if (!d) throw new NotFound("Docket not found");
  return d;
}

export async function advanceDocket(staff: Staff, docketId: string, to: DocketStatus) {
  await withTenant(staff.tenantId, async (tx) => {
    const d = await docketForStaff(tx, staff, docketId);
    assertCanAdvance(d, to);
    const stamp = { in_progress: { startedAt: new Date() }, ready: { readyAt: new Date() }, done: { doneAt: new Date() }, new: {} }[to];
    await tx.update(t.docket).set({ status: to, ...stamp }).where(and(eq(t.docket.id, d.id), eq(t.docket.status, d.status)));
    await publish(tx, topics.venue(staff.venueId), { kind: "dockets" });
    await publish(tx, topics.order(d.orderId), { kind: "order" });
  });
}

export type AgeDocument = "age_card" | "passport" | "driving_licence";

/** Staff saw valid ID: verify the guest's account (no image or number stored) and clear the docket. */
export async function recordIdCheck(staff: Staff, docketId: string, documentType: AgeDocument) {
  await withTenant(staff.tenantId, async (tx) => {
    const d = await docketForStaff(tx, staff, docketId);
    const [o] = await tx.select().from(t.orders).where(eq(t.orders.id, d.orderId));
    const now = new Date();
    await tx
      .update(t.customer)
      .set({ ageVerifiedAt: now, ageVerifiedByStaffId: staff.id, ageVerificationMethod: "staff_id_check", ageDocumentType: documentType })
      .where(eq(t.customer.id, o.customerId));
    await tx.update(t.docket).set({ idCheckedAt: now, idCheckedByStaffId: staff.id }).where(eq(t.docket.id, d.id));
    await tx.insert(t.auditLog).values({ tenantId: staff.tenantId, actor: `staff:${staff.id}`, action: "id_checked", entity: `customer:${o.customerId}`, detail: { documentType, docketId } });
    await publish(tx, topics.venue(staff.venueId), { kind: "dockets" });
  });
}

/** Staff refused service: refund the whole order, reverse its loyalty, close its dockets. */
export async function refuseId(staff: Staff, docketId: string, provider: PaymentProvider) {
  const order = await withTenant(staff.tenantId, async (tx) => {
    const d = await docketForStaff(tx, staff, docketId);
    const [o] = await tx
      .update(t.orders)
      .set({ status: "refunded", refundedCents: sql`${t.orders.amountPaidCents}` })
      .where(and(eq(t.orders.id, d.orderId), eq(t.orders.status, "paid")))
      .returning();
    if (!o) throw new Forbidden("Order isn't refundable");
    const entries = await tx.select().from(t.loyaltyLedger).where(eq(t.loyaltyLedger.orderId, o.id));
    await writeLedger(tx, staff.tenantId, o.membershipId, reverseEntries(entries, o.id));
    await tx.update(t.docket).set({ status: "done", doneAt: new Date() }).where(eq(t.docket.orderId, o.id));
    await tx.insert(t.auditLog).values({ tenantId: staff.tenantId, actor: `staff:${staff.id}`, action: "id_refused", entity: `order:${o.id}`, detail: { docketId } });
    await publish(tx, topics.venue(staff.venueId), { kind: "dockets" });
    await publish(tx, topics.order(o.id), { kind: "order" });
    return o;
  });
  if (order.providerOrderId && order.amountPaidCents > 0) {
    await provider.refund(order.providerOrderId, order.amountPaidCents, "ID check refused");
  }
}

// ---------------------------------------------------------------- office

export async function salesSummary(venue: Venue, from: Date, to: Date) {
  return withTenant(venue.tenantId, async (tx) => {
    const os = await tx
      .select()
      .from(t.orders)
      .where(and(eq(t.orders.venueId, venue.id), inArray(t.orders.status, ["paid", "refunded"]), gte(t.orders.paidAt, from), lt(t.orders.paidAt, to)));
    const paid = os.filter((o) => o.status === "paid");
    const byHour = Array.from({ length: 24 }, () => 0);
    for (const o of paid) byHour[new Date(o.paidAt!).getHours()] += o.grossCents;
    const [{ members }] = await tx.select({ members: sql<number>`count(*)::int` }).from(t.membership).where(eq(t.membership.programmeId, venue.programmeId));
    return {
      orders: paid.length,
      grossCents: paid.reduce((s, o) => s + o.grossCents, 0),
      cardCents: paid.reduce((s, o) => s + o.amountPaidCents, 0),
      creditCents: paid.reduce((s, o) => s + o.creditUsedCents, 0),
      vat9Cents: paid.reduce((s, o) => s + o.vat9Cents, 0),
      vat23Cents: paid.reduce((s, o) => s + o.vat23Cents, 0),
      refundedCents: os.reduce((s, o) => s + o.refundedCents, 0),
      tableOrders: paid.filter((o) => o.channel === "table").length,
      collectOrders: paid.filter((o) => o.channel === "collect").length,
      byHour,
      members,
    };
  });
}

export async function billingStatement(venue: Venue, year: number, month: number) {
  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 1));
  return withTenant(venue.tenantId, async (tx) => {
    const [sub] = await tx.select().from(t.subscription).where(eq(t.subscription.venueId, venue.id));
    const [row] = await tx
      .select({
        gross: sql<number>`coalesce(sum(${t.orders.amountPaidCents}), 0)::int`,
        refunds: sql<number>`coalesce(sum(${t.orders.refundedCents}), 0)::int`,
      })
      .from(t.orders)
      .where(and(eq(t.orders.venueId, venue.id), inArray(t.orders.status, ["paid", "refunded"]), gte(t.orders.paidAt, from), lt(t.orders.paidAt, to)));
    return buildStatement({
      appGrossCents: row.gross,
      appRefundsCents: row.refunds,
      appFeeBps: sub?.appFeeBps ?? 100,
      subscriptionCents: sub?.monthlyFeeCents ?? 0,
    });
  });
}

export async function menuForOffice(venue: Venue) {
  return withTenant(venue.tenantId, (tx) =>
    tx.select().from(t.menuItem).where(eq(t.menuItem.venueId, venue.id)).orderBy(asc(t.menuItem.station), asc(t.menuItem.sort)),
  );
}
