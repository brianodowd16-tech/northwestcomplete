import {
  ageOn,
  assertCanAdvance,
  assertCanRevert,
  balances,
  buildStatement,
  convertPoints,
  normaliseRules,
  resolveRedemption,
  hashOtp,
  levelFor,
  newOtp,
  nextLevel,
  priceCart,
  reverseEntries,
  settleOrder,
  signupEntries,
  splitByStation,
  trialAdjust,
  type Channel,
  type DocketStatus,
  type LedgerEntry,
  type PaymentProvider,
  type WebhookEvent,
  type PricedMenuItem,
  type Station,
} from "@round/core";
import { and, asc, desc, eq, gte, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { publish, systemDb, topics, withTenant, type Tx } from "./index";
import * as t from "./schema";
import { depleteForOrder, restockForOrder } from "./inventory";

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

/** Venues guests can find: live ones only. */
export async function liveVenues() {
  return systemDb().select().from(t.venue).where(eq(t.venue.status, "live")).orderBy(asc(t.venue.name));
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

/** Tables in use (switched-off tables keep their row so old QR codes say "not found"). */
export async function venueTables(venue: Venue) {
  return withTenant(venue.tenantId, (tx) =>
    tx.select().from(t.venueTable).where(and(eq(t.venueTable.venueId, venue.id), eq(t.venueTable.active, true))).orderBy(asc(t.venueTable.number)),
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
  /** public base URL of the app, for the payment provider's return and notify URLs */
  appUrl: string;
  /** orders an AI assistant prepares wait for the guest to approve them, even when fully paid by credit */
  holdForApproval?: boolean;
}

export type Order = typeof t.orders.$inferSelect;

export interface Checkout {
  provider: PaymentProvider["name"];
  token: string | null;
  publicKey: string | null;
  redirect: { action: string; fields: [string, string][] } | null;
}

export interface CreatedOrderResult {
  order: Order;
  /** null when nothing is left to pay (credit covered it, or already paid) */
  checkout: Checkout | null;
}

export async function createOrder(input: CreateOrderInput, provider: PaymentProvider): Promise<CreatedOrderResult> {
  if (input.venue.status === "suspended") throw new Forbidden(`${input.venue.name} isn't taking orders right now`);
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
    // The venue's redemption rules decide what actually applies; the request is only a wish.
    const [prog] = await tx.select().from(t.programme).where(eq(t.programme.id, venue.programmeId));
    const rules = normaliseRules(prog.redemptionRules);
    const resolved = resolveRedemption(
      { wantCredit: input.creditRequestedCents > 0, wantDouble: input.useDouble },
      cart.grossCents,
      { balances: b },
      rules,
      await creditBudgetLeftTx(tx, venue, rules.monthlyCreditBudgetCents),
    );
    const credit = Math.min(resolved.creditCents, input.creditRequestedCents);

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
        useDouble: resolved.useDouble,
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

  const order = created.order;

  if (order.status !== "pending_payment") return { order, checkout: null };
  // Prepared by an AI assistant: nothing is charged or sent to the bar until the guest approves.
  if (created.isNew && input.holdForApproval) return { order, checkout: null };
  if (created.isNew && order.amountPaidCents === 0) {
    await completeOrder(venue.tenantId, order.id);
    return { order: (await getOrderRow(venue, order.id))!, checkout: null };
  }
  // A repeated request for a pending order reuses its widget token; hosted checkouts rebuild their form.
  if (!created.isNew && order.providerToken) {
    return { order, checkout: { provider: provider.name, token: order.providerToken, publicKey: provider.publicKey, redirect: null } };
  }

  const lines = await withTenant(venue.tenantId, (tx) => tx.select().from(t.orderLine).where(eq(t.orderLine.orderId, order.id)));
  const names = customer.name.trim().split(/\s+/);
  const orderUrl = `${input.appUrl}/v/${venue.slug}/order/${order.id}`;
  const p = await provider.createOrder({
    amountCents: order.amountPaidCents,
    currency: "EUR",
    reference: order.id,
    description: `${venue.name} order #${order.number}`,
    lineItems: lines.map((l) => ({ name: l.name, quantity: l.qty, unitPriceCents: l.unitPriceCents, totalCents: l.grossCents, externalId: null })),
    discountCents: order.creditUsedCents,
    customer: { email: customer.email, firstName: names[0] || "Guest", lastName: names.slice(1).join(" ") || names[0] || "Guest" },
    urls: { ok: orderUrl, cancel: `${orderUrl}?cancelled=1`, notify: `${input.appUrl}/api/webhooks/${provider.name}/${venue.slug}` },
  });
  const updated = await withTenant(venue.tenantId, async (tx) => {
    const [u] = await tx
      .update(t.orders)
      .set({ providerOrderId: p.providerOrderId, providerToken: p.token, provider: provider.name })
      .where(eq(t.orders.id, order.id))
      .returning();
    return u;
  });
  return { order: updated, checkout: { provider: provider.name, token: p.token, publicKey: provider.publicKey, redirect: p.redirect } };
}

/**
 * The guest approves an order an AI assistant prepared: a fully credited order is placed
 * straight away, otherwise the venue's normal checkout starts.
 */
export async function approveHeldOrder(venue: Venue, customer: Customer, orderId: string, provider: PaymentProvider, appUrl: string): Promise<CreatedOrderResult> {
  const o = await getOrderRow(venue, orderId);
  if (!o || o.customerId !== customer.id) throw new NotFound("Order not found");
  if (o.status !== "pending_payment") throw new Forbidden("This order isn't waiting for approval");
  if (o.providerOrderId) throw new Forbidden("This order is already being paid");
  // The payment clock starts when the guest approves, not when the assistant prepared it.
  await withTenant(venue.tenantId, (tx) => tx.update(t.orders).set({ createdAt: new Date() }).where(and(eq(t.orders.id, o.id), eq(t.orders.status, "pending_payment"))));
  if (o.amountPaidCents === 0) {
    await completeOrder(venue.tenantId, o.id);
    return { order: (await getOrderRow(venue, o.id))!, checkout: null };
  }
  return createOrder({ venue, customer, channel: o.channel, tableId: o.tableId, lines: [], creditRequestedCents: 0, useDouble: false, idempotencyKey: o.idempotencyKey, appUrl }, provider);
}

/** Loyalty credit the venue can still give away this month, or null when it has no cap. */
export async function creditBudgetLeftTx(tx: Tx, venue: Venue, budgetCents: number | null): Promise<number | null> {
  if (budgetCents === null) return null;
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const [row] = await tx
    .select({ used: sql<number>`coalesce(sum(${t.orders.creditUsedCents}), 0)::int` })
    .from(t.orders)
    .where(and(eq(t.orders.venueId, venue.id), inArray(t.orders.status, ["paid", "pending_payment"]), gte(t.orders.createdAt, monthStart)));
  return Math.max(0, budgetCents - row.used);
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
export async function completeOrder(tenantId: string, orderId: string, txnRef?: string): Promise<boolean> {
  return withTenant(tenantId, async (tx) => {
    const [order] = await tx
      .update(t.orders)
      .set({ status: "paid", paidAt: new Date(), providerTxnRef: txnRef ?? null })
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
    await depleteForOrder(tx, tenantId, order.venueId, order.id);

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

/**
 * Handles a payment notification. `venue` is the venue named in the notify URL:
 * hosted checkouts (myPOS) are verified with that venue's own certificate.
 */
export async function handleWebhook(provider: PaymentProvider, rawBody: string, headers: Headers, venue?: Venue): Promise<WebhookResult> {
  const db = systemDb();
  const valid = provider.verifyWebhook(rawBody, headers);
  let parsed: WebhookEvent | null = null;
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
        if (venue && order.venueId !== venue.id) throw new Error("Notification for another venue's order");
        if (parsed.amountCents !== undefined && parsed.amountCents !== order.amountPaidCents) {
          throw new Error(`Amount mismatch: notified ${parsed.amountCents}, expected ${order.amountPaidCents}`);
        }
        // A signed hosted-checkout notification is authoritative; otherwise don't trust event
        // order and ask the provider for the order's current state.
        const state = parsed.state ?? (provider.getOrder ? (await provider.getOrder(parsed.providerOrderId)).state : null);
        if (state === "completed") await completeOrder(order.tenantId, order.id, parsed.txnRef);
      }
    }
    await db.update(t.webhookEvent).set({ processedAt: new Date() }).where(eq(t.webhookEvent.id, stored.id));
    return { status: 200, body: "OK" };
  } catch (e) {
    await db.update(t.webhookEvent).set({ error: String(e) }).where(eq(t.webhookEvent.id, stored.id));
    throw e;
  }
}

/** Unpaid orders older than this are abandoned (hosted checkouts can't be looked up). */
export const ABANDON_AFTER_MS = 30 * 60_000;

/**
 * Settles orders whose notification never arrived, and cancels abandoned ones.
 * Runs every minute. `providerFor` gives each venue's own provider.
 */
export async function reconcilePending(providerFor: (venueId: string) => Promise<PaymentProvider>, olderThanMs = 3 * 60_000) {
  const stale = await systemDb()
    .select()
    .from(t.orders)
    .where(and(eq(t.orders.status, "pending_payment"), lt(t.orders.createdAt, new Date(Date.now() - olderThanMs))));
  let settled = 0;
  const cancel = (o: Order) =>
    withTenant(o.tenantId, (tx) => tx.update(t.orders).set({ status: "cancelled" }).where(and(eq(t.orders.id, o.id), eq(t.orders.status, "pending_payment"))));
  for (const o of stale) {
    const abandoned = Date.now() - o.createdAt.getTime() > ABANDON_AFTER_MS;
    try {
      const provider = await providerFor(o.venueId);
      if (!o.providerOrderId || !provider.getOrder) {
        if (abandoned) await cancel(o);
        continue;
      }
      const { state } = await provider.getOrder(o.providerOrderId);
      if (state === "completed" && (await completeOrder(o.tenantId, o.id))) settled++;
      else if (state === "cancelled" || state === "failed" || (abandoned && state === "pending")) await cancel(o);
    } catch (e) {
      console.error("reconcile", o.id, e);
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

/** Orders the guest's AI assistant prepared that are waiting for the guest to approve. */
export async function heldOrdersForCustomer(venue: Venue, customerId: string) {
  return withTenant(venue.tenantId, async (tx) => {
    const os = await tx
      .select()
      .from(t.orders)
      .where(and(eq(t.orders.venueId, venue.id), eq(t.orders.customerId, customerId), eq(t.orders.status, "pending_payment"), isNull(t.orders.providerOrderId)))
      .orderBy(desc(t.orders.createdAt));
    return os.filter((o) => o.idempotencyKey.startsWith("agent:"));
  });
}

/** Today's paid orders with their docket progress, for the guest's home screen. */
export async function activeOrdersForCustomer(venue: Venue, customerId: string) {
  return withTenant(venue.tenantId, async (tx) => {
    const since = new Date(Date.now() - 12 * 3_600_000);
    const os = await tx
      .select()
      .from(t.orders)
      .where(and(eq(t.orders.venueId, venue.id), eq(t.orders.customerId, customerId), eq(t.orders.status, "paid"), gte(t.orders.paidAt, since)))
      .orderBy(desc(t.orders.paidAt));
    if (!os.length) return [];
    const ds = await tx.select().from(t.docket).where(inArray(t.docket.orderId, os.map((o) => o.id)));
    return os
      .map((o) => ({ order: o, dockets: ds.filter((d) => d.orderId === o.id) }))
      .filter((x) => x.dockets.some((d) => d.status !== "done"));
  });
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

/** Undo a mistaken tap: step the docket back one status, within the undo window. */
export async function revertDocket(staff: Staff, docketId: string) {
  await withTenant(staff.tenantId, async (tx) => {
    const d = await docketForStaff(tx, staff, docketId);
    const to = assertCanRevert(d);
    const clear = { in_progress: { startedAt: null }, ready: { readyAt: null }, done: { doneAt: null }, new: {} }[d.status];
    await tx.update(t.docket).set({ status: to, ...clear }).where(and(eq(t.docket.id, d.id), eq(t.docket.status, d.status)));
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

/**
 * Staff refused service: refund the whole order, reverse its loyalty, close its dockets.
 * The card refund goes first, so a failed refund leaves the order untouched for a retry.
 */
export async function refuseId(staff: Staff, docketId: string, provider: PaymentProvider) {
  const paid = await withTenant(staff.tenantId, async (tx) => {
    const d = await docketForStaff(tx, staff, docketId);
    const [o] = await tx.select().from(t.orders).where(eq(t.orders.id, d.orderId));
    if (!o || o.status !== "paid") throw new Forbidden("Order isn't refundable");
    return o;
  });
  if (paid.providerOrderId && paid.amountPaidCents > 0) {
    await provider.refund({ providerOrderId: paid.providerOrderId, txnRef: paid.providerTxnRef, amountCents: paid.amountPaidCents }, "ID check refused");
  }
  await withTenant(staff.tenantId, async (tx) => {
    const [o] = await tx
      .update(t.orders)
      .set({ status: "refunded", refundedCents: sql`${t.orders.amountPaidCents}`, refundedAt: new Date() })
      .where(and(eq(t.orders.id, paid.id), eq(t.orders.status, "paid")))
      .returning();
    if (!o) return;
    const entries = await tx.select().from(t.loyaltyLedger).where(eq(t.loyaltyLedger.orderId, o.id));
    await writeLedger(tx, staff.tenantId, o.membershipId, reverseEntries(entries, o.id));
    await restockForOrder(tx, staff.tenantId, o.venueId, o.id); // refused at the bar: nothing was served
    await tx.update(t.docket).set({ status: "done", doneAt: new Date() }).where(eq(t.docket.orderId, o.id));
    await tx.insert(t.auditLog).values({ tenantId: staff.tenantId, actor: `staff:${staff.id}`, action: "id_refused", entity: `order:${o.id}`, detail: { docketId } });
    await publish(tx, topics.venue(staff.venueId), { kind: "dockets" });
    await publish(tx, topics.order(o.id), { kind: "order" });
  });
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

/** Back office dashboard for a period, with the previous period of the same length to compare. */
export async function dashboard(venue: Venue, from: Date, to: Date) {
  const span = to.getTime() - from.getTime();
  const [now, before] = [await salesSummary(venue, from, to), await salesSummary(venue, new Date(from.getTime() - span), from)];
  return withTenant(venue.tenantId, async (tx) => {
    const os = await tx
      .select()
      .from(t.orders)
      .where(and(eq(t.orders.venueId, venue.id), eq(t.orders.status, "paid"), gte(t.orders.paidAt, from), lt(t.orders.paidAt, to)));
    const lines = os.length ? await tx.select().from(t.orderLine).where(inArray(t.orderLine.orderId, os.map((o) => o.id))) : [];
    const items = new Map<string, { name: string; qty: number; grossCents: number }>();
    for (const l of lines) {
      const it = items.get(l.name) ?? { name: l.name, qty: 0, grossCents: 0 };
      it.qty += l.qty;
      it.grossCents += l.grossCents;
      items.set(l.name, it);
    }
    const days = Math.max(1, Math.round(span / 86_400_000));
    const byDay = Array.from({ length: days }, (_, i) => {
      const d0 = from.getTime() + i * 86_400_000;
      return { day: new Date(d0).toISOString().slice(0, 10), grossCents: os.filter((o) => o.paidAt!.getTime() >= d0 && o.paidAt!.getTime() < d0 + 86_400_000).reduce((s, o) => s + o.grossCents, 0) };
    });
    const recent = await tx
      .select()
      .from(t.orders)
      .where(and(eq(t.orders.venueId, venue.id), ne(t.orders.status, "pending_payment")))
      .orderBy(desc(t.orders.createdAt))
      .limit(10);
    const recentIds = recent.map((o) => o.id);
    const [rDockets, rCust, tables] = recentIds.length
      ? await Promise.all([
          tx.select().from(t.docket).where(inArray(t.docket.orderId, recentIds)),
          tx.select({ id: t.customer.id, name: t.customer.name }).from(t.customer).where(inArray(t.customer.id, recent.map((o) => o.customerId))),
          tx.select().from(t.venueTable).where(eq(t.venueTable.venueId, venue.id)),
        ])
      : [[], [], []];
    return {
      now,
      before,
      byDay,
      topItems: [...items.values()].sort((a, b) => b.grossCents - a.grossCents).slice(0, 5),
      recent: recent.map((o) => ({
        id: o.id,
        number: o.number,
        status: o.status,
        grossCents: o.grossCents,
        createdAt: o.createdAt,
        channel: o.channel,
        tableNumber: tables.find((x) => x.id === o.tableId)?.number ?? null,
        guest: (rCust.find((c) => c.id === o.customerId)?.name ?? "Guest").split(" ")[0],
        dockets: rDockets.filter((d) => d.orderId === o.id).map((d) => ({ station: d.station, status: d.status })),
      })),
    };
  });
}

export async function billingStatement(venue: Venue, year: number, month: number) {
  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 1));
  return withTenant(venue.tenantId, async (tx) => {
    const [sub] = await tx.select().from(t.subscription).where(eq(t.subscription.venueId, venue.id));
    // Free trial: no app fee on payments before it ends, subscription only for the rest of the month.
    const trial = trialAdjust(sub?.trialEndsAt ?? null, from, to, sub?.monthlyFeeCents ?? 0);
    const [row] = await tx
      .select({
        gross: sql<number>`coalesce(sum(${t.orders.amountPaidCents}), 0)::int`,
        refunds: sql<number>`coalesce(sum(${t.orders.refundedCents}), 0)::int`,
      })
      .from(t.orders)
      .where(and(eq(t.orders.venueId, venue.id), inArray(t.orders.status, ["paid", "refunded"]), ne(t.orders.provider, "mock"), gte(t.orders.paidAt, trial.chargeFrom), lt(t.orders.paidAt, to)));
    return buildStatement({
      appGrossCents: row.gross,
      appRefundsCents: row.refunds,
      appFeeBps: sub?.appFeeBps ?? 100,
      subscriptionCents: trial.subscriptionCents,
    });
  });
}

export async function menuForOffice(venue: Venue) {
  return withTenant(venue.tenantId, (tx) =>
    tx.select().from(t.menuItem).where(eq(t.menuItem.venueId, venue.id)).orderBy(asc(t.menuItem.station), asc(t.menuItem.sort)),
  );
}
