import { checkPurchase, MembershipError, pointsForPurchase, tierEnds, tierPrice, TIERS, type PaymentProvider, type Tier, type TierPeriod, type WebhookEvent } from "@round/core";
import { and, desc, eq, gt, gte, lt, sql } from "drizzle-orm";
import { systemDb } from "./index";
import * as t from "./schema";
import type { Customer } from "./services";
import { walletBalances } from "./wallet";

/**
 * Complete membership (Gold/Platinum) and Complete Points purchases. These are paid to Complete's own
 * merchant account (not a venue's), and points are spent at any venue; Complete settles what was
 * spent at each venue on its monthly invoice. Guest-level data: every call is for the signed-in guest.
 */

export type CompletePayment = typeof t.completePayment.$inferSelect;

/** The guest's current membership, if any (the latest one that hasn't ended). */
export async function currentTier(customerId: string, now = new Date()) {
  const [m] = await systemDb()
    .select()
    .from(t.guestMembership)
    .where(and(eq(t.guestMembership.customerId, customerId), gt(t.guestMembership.endsAt, now), eq(t.guestMembership.status, "active")))
    .orderBy(desc(t.guestMembership.endsAt))
    .limit(1);
  return m ?? null;
}

/** Everything the membership page shows: tier, balances, recent points activity. */
export async function walletSummary(customerId: string) {
  const db = systemDb();
  const balances = await db.transaction((tx) => walletBalances(tx, customerId));
  const recent = await db
    .select({ id: t.walletLedger.id, kind: t.walletLedger.kind, delta: t.walletLedger.delta, reason: t.walletLedger.reason, createdAt: t.walletLedger.createdAt, venueName: t.venue.name })
    .from(t.walletLedger)
    .leftJoin(t.venue, eq(t.venue.id, t.walletLedger.venueId))
    .where(eq(t.walletLedger.customerId, customerId))
    .orderBy(desc(t.walletLedger.createdAt))
    .limit(15);
  return { tier: await currentTier(customerId), balances, recent };
}

async function boughtThisMonth(customerId: string, now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [r] = await systemDb()
    .select({ n: sql<number>`coalesce(sum(${t.walletLedger.delta}), 0)::int` })
    .from(t.walletLedger)
    .where(and(eq(t.walletLedger.customerId, customerId), eq(t.walletLedger.reason, "purchase"), gte(t.walletLedger.createdAt, start)));
  return r.n;
}

async function startPayment(customer: Customer, kind: "tier" | "points", amountCents: number, meta: CompletePayment["meta"], description: string, key: string, provider: PaymentProvider, appUrl: string) {
  const idem = `complete:${kind}:${customer.id}:${key.slice(0, 80)}`;
  const db = systemDb();
  const [dupe] = await db.select().from(t.completePayment).where(eq(t.completePayment.idempotencyKey, idem));
  if (dupe?.providerToken) return { payment: dupe, checkout: { provider: provider.name, token: dupe.providerToken, publicKey: provider.publicKey, redirect: null } };
  const [payment] = dupe ? [dupe] : await db.insert(t.completePayment).values({ customerId: customer.id, kind, amountCents, meta, provider: provider.name, idempotencyKey: idem }).returning();
  const names = customer.name.trim().split(/\s+/);
  const back = `${appUrl}/me/membership`;
  const p = await provider.createOrder({
    amountCents,
    currency: "EUR",
    reference: payment.id,
    description,
    lineItems: [{ name: description, quantity: 1, unitPriceCents: amountCents, totalCents: amountCents, externalId: null }],
    discountCents: 0,
    customer: { email: customer.email, firstName: names[0] || "Guest", lastName: names.slice(1).join(" ") || names[0] || "Guest" },
    urls: { ok: `${back}?paid=1`, cancel: `${back}?cancelled=1`, notify: `${appUrl}/api/webhooks/complete/${provider.name}` },
  });
  const [u] = await db.update(t.completePayment).set({ providerOrderId: p.providerOrderId, providerToken: p.token }).where(eq(t.completePayment.id, payment.id)).returning();
  return { payment: u, checkout: { provider: provider.name, token: p.token, publicKey: provider.publicKey, redirect: p.redirect } };
}

/** Starts buying (or upgrading to) Gold or Platinum for a month or a year. */
export async function buyTier(customer: Customer, tier: Tier, period: TierPeriod, key: string, provider: PaymentProvider, appUrl: string) {
  if (!TIERS[tier] || (period !== "monthly" && period !== "annual")) throw new MembershipError("Choose a membership");
  const cur = await currentTier(customer.id);
  if (cur && cur.tier === "platinum" && tier === "gold") throw new MembershipError("You're already Platinum");
  const price = tierPrice(tier, period);
  return startPayment(customer, "tier", price, { tier, period }, `Complete ${TIERS[tier].name} (${period === "annual" ? "1 year" : "1 month"})`, key, provider, appUrl);
}

/** Starts buying points (€10, €25, €50 or €100), within the wallet limits. */
export async function buyPoints(customer: Customer, cents: number, key: string, provider: PaymentProvider, appUrl: string) {
  pointsForPurchase(cents, null); // checks the bundle
  const bal = await systemDb().transaction((tx) => walletBalances(tx, customer.id));
  checkPurchase(cents, bal.paid, await boughtThisMonth(customer.id));
  return startPayment(customer, "points", cents, { cents }, `Complete Points: ${(cents).toLocaleString("en-IE")} points`, key, provider, appUrl);
}

/**
 * Settles a verified payment to Complete: starts or extends the membership (with this month's bonus
 * points), or adds the points (plus the tier's purchase bonus). Idempotent: a payment settles once.
 */
export async function settleCompletePayment(paymentId: string, now = new Date()) {
  return systemDb().transaction(async (tx) => {
    const [p] = await tx.update(t.completePayment).set({ status: "paid", paidAt: now }).where(and(eq(t.completePayment.id, paymentId), eq(t.completePayment.status, "pending_payment"))).returning();
    if (!p) return false;
    await tx.execute(sql`select 1 from customer where id = ${p.customerId} for update`);
    const [cur] = await tx.select().from(t.guestMembership).where(and(eq(t.guestMembership.customerId, p.customerId), gt(t.guestMembership.endsAt, now), eq(t.guestMembership.status, "active"))).orderBy(desc(t.guestMembership.endsAt)).limit(1);
    if (p.kind === "tier") {
      const tier = p.meta.tier!, period = p.meta.period!;
      // Renewing the same tier extends it; an upgrade starts now (the old one ends).
      const from = cur && cur.tier === tier ? cur.endsAt : now;
      if (cur && cur.tier !== tier) await tx.update(t.guestMembership).set({ status: "cancelled", endsAt: now }).where(eq(t.guestMembership.id, cur.id));
      const [m] = await tx.insert(t.guestMembership).values({ customerId: p.customerId, tier, period, startsAt: from, endsAt: tierEnds(from, period), paymentId: p.id }).returning();
      await grantMonthly(tx, m, now);
    } else {
      const pts = pointsForPurchase(p.amountCents, cur?.tier ?? null);
      await tx.insert(t.walletLedger).values({ customerId: p.customerId, kind: "paid", delta: pts.paid, reason: "purchase", paymentId: p.id, refKey: `purchase:${p.id}` });
      if (pts.bonus) await tx.insert(t.walletLedger).values({ customerId: p.customerId, kind: "bonus", delta: pts.bonus, reason: "purchase_bonus", paymentId: p.id, refKey: `purchase_bonus:${p.id}` });
    }
    return true;
  });
}

type Tx = Parameters<Parameters<ReturnType<typeof systemDb>["transaction"]>[0]>[0];

/** The monthly bonus points for each month of a membership that has started. Once per month (by ref key). */
async function grantMonthly(tx: Tx, m: typeof t.guestMembership.$inferSelect, now: Date) {
  let granted = 0;
  for (let k = 0; k <= 24; k++) {
    const monthStart = new Date(m.startsAt);
    monthStart.setUTCMonth(monthStart.getUTCMonth() + k);
    if (monthStart > now || monthStart >= m.endsAt) break;
    const r = await tx.insert(t.walletLedger).values({ customerId: m.customerId, kind: "bonus", delta: TIERS[m.tier].monthlyBonusPoints, reason: "tier_monthly", refKey: `tier_monthly:${m.id}:${k}` }).onConflictDoNothing().returning();
    granted += r.length;
  }
  return granted;
}

/** Daily job: each active membership gets its bonus for any month that has begun. */
export async function grantMonthlyBonuses(now = new Date()) {
  const ms = await systemDb().select().from(t.guestMembership).where(and(eq(t.guestMembership.status, "active"), gt(t.guestMembership.endsAt, new Date(now.getTime() - 86_400_000)), lt(t.guestMembership.startsAt, now)));
  for (const m of ms) await systemDb().transaction((tx) => grantMonthly(tx, m, now));
  return ms.length;
}

/** A verified notification from Complete's own payment provider. Checks the amount; settles once. */
export async function handleCompleteWebhook(provider: PaymentProvider, rawBody: string, headers: Headers) {
  if (!provider.verifyWebhook(rawBody, headers)) return { status: 401 as const };
  let parsed: WebhookEvent;
  try {
    parsed = provider.parseWebhook(rawBody);
  } catch {
    return { status: 400 as const };
  }
  await systemDb().insert(t.webhookEvent).values({ provider: `complete:${provider.name}`, raw: rawBody, signatureValid: true, event: parsed.event, providerOrderId: parsed.providerOrderId });
  if (parsed.event !== "ORDER_COMPLETED") return { status: 200 as const };
  const [p] = await systemDb().select().from(t.completePayment).where(eq(t.completePayment.providerOrderId, parsed.providerOrderId));
  if (!p) return { status: 200 as const };
  if (parsed.amountCents !== undefined && parsed.amountCents !== p.amountCents) throw new Error(`Amount mismatch on Complete payment ${p.id}`);
  const state = parsed.state ?? (provider.getOrder ? (await provider.getOrder(parsed.providerOrderId)).state : null);
  if (state === "completed") await settleCompletePayment(p.id);
  return { status: 200 as const };
}

/** What Complete owes each venue for points spent there in a period (net of reversals). */
export async function walletSettlement(venueId: string, from: Date, to: Date) {
  const [r] = await systemDb()
    .select({ n: sql<number>`coalesce(-sum(${t.walletLedger.delta}), 0)::int` })
    .from(t.walletLedger)
    .where(and(eq(t.walletLedger.venueId, venueId), sql`${t.walletLedger.reason} in ('redeem','reversal')`, gte(t.walletLedger.createdAt, from), lt(t.walletLedger.createdAt, to)));
  return r.n;
}

/** One of the guest's own payments to Complete. */
export async function paymentForCustomer(customerId: string, id: string) {
  const [p] = await systemDb().select().from(t.completePayment).where(and(eq(t.completePayment.id, id), eq(t.completePayment.customerId, customerId)));
  return p ?? null;
}
