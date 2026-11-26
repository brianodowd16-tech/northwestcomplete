import { and, isNull, eq, gte, inArray } from "drizzle-orm";
import { systemDb } from "./index";
import * as t from "./schema";

// GDPR: guests can download everything held about them, and delete their account.
// Orders are kept (anonymised) because VAT law requires the venue to keep sales records for 6 years.

export async function exportGuestData(customerId: string) {
  const db = systemDb();
  const [c] = await db.select().from(t.customer).where(eq(t.customer.id, customerId));
  if (!c) return null;
  const ms = await db.select().from(t.membership).where(eq(t.membership.customerId, customerId));
  const ledger = ms.length ? await db.select().from(t.loyaltyLedger).where(inArray(t.loyaltyLedger.membershipId, ms.map((m) => m.id))) : [];
  const orders = await db.select().from(t.orders).where(eq(t.orders.customerId, customerId));
  const lines = orders.length ? await db.select().from(t.orderLine).where(inArray(t.orderLine.orderId, orders.map((o) => o.id))) : [];
  const venues = new Map((await db.select({ id: t.venue.id, name: t.venue.name, programmeId: t.venue.programmeId }).from(t.venue)).map((v) => [v.id, v]));
  const bookings = await db.select().from(t.booking).where(eq(t.booking.customerId, customerId));
  const groups = await db.select({ name: t.guestGroup.name, joined: t.groupMember.joinedAt, left: t.groupMember.leftAt }).from(t.groupMember).innerJoin(t.guestGroup, eq(t.guestGroup.id, t.groupMember.groupId)).where(eq(t.groupMember.customerId, customerId));
  const msgs = await db.select({ body: t.groupMessage.body, at: t.groupMessage.createdAt }).from(t.groupMessage).where(eq(t.groupMessage.customerId, customerId));
  const shares = await db.select({ title: t.billSplit.title, cents: t.billShare.amountCents, status: t.billShare.status, at: t.billSplit.createdAt }).from(t.billShare).innerJoin(t.billSplit, eq(t.billSplit.id, t.billShare.splitId)).where(eq(t.billShare.customerId, customerId));
  const grants = await db.select({ name: t.agentGrant.name, scopes: t.agentGrant.scopes, createdAt: t.agentGrant.createdAt, revokedAt: t.agentGrant.revokedAt }).from(t.agentGrant).where(eq(t.agentGrant.customerId, customerId));
  return {
    exportedAt: new Date().toISOString(),
    profile: { name: c.name, phone: c.phone, email: c.email, dateOfBirth: c.dateOfBirth, marketingConsent: c.marketingConsent, ageVerifiedAt: c.ageVerifiedAt, ageVerificationMethod: c.ageVerificationMethod, leaderboard: c.leaderboardOptIn ? c.leaderboardName : null, revolutHandle: c.revolutHandle, createdAt: c.createdAt },
    groups: groups.map((g) => ({ name: g.name, joined: g.joined, left: g.left })),
    messages: msgs.filter((m) => m.body),
    sharedBills: shares,
    memberships: ms.map((m) => ({
      venue: [...venues.values()].find((v) => v.programmeId === m.programmeId)?.name ?? "",
      joined: m.createdAt,
      ledger: ledger.filter((l) => l.membershipId === m.id).map((l) => ({ kind: l.kind, delta: l.delta, reason: l.reason, at: l.createdAt })),
    })),
    orders: orders.map((o) => ({
      venue: venues.get(o.venueId)?.name ?? "",
      number: o.number,
      status: o.status,
      paidAt: o.paidAt,
      totalCents: o.grossCents,
      paidCents: o.amountPaidCents,
      tipCents: o.tipCents,
      lines: lines.filter((l) => l.orderId === o.id).map((l) => ({ name: l.name, qty: l.qty, grossCents: l.grossCents, note: l.note })),
    })),
    bookings: bookings.map((b) => ({ venue: venues.get(b.venueId)?.name ?? "", at: b.startsAt, partySize: b.partySize, status: b.status })),
    aiAssistants: grants,
  };
}

/** Wipes the guest's personal details and ends everything that could contact them. Irreversible. */
export async function deleteGuest(customerId: string) {
  const db = systemDb();
  await db.transaction(async (tx) => {
    await tx
      .update(t.customer)
      .set({ name: "Deleted guest", email: "", phone: `deleted:${customerId}`, dateOfBirth: "1900-01-01", marketingConsent: false, deletedAt: new Date() })
      .where(eq(t.customer.id, customerId));
    await tx.delete(t.pushSubscription).where(eq(t.pushSubscription.customerId, customerId));
    await tx.update(t.agentGrant).set({ revokedAt: new Date() }).where(eq(t.agentGrant.customerId, customerId));
    await tx.update(t.booking).set({ status: "cancelled", note: "" }).where(and(eq(t.booking.customerId, customerId), gte(t.booking.startsAt, new Date())));
    await tx.update(t.orderLine).set({ note: null }).where(inArray(t.orderLine.orderId, tx.select({ id: t.orders.id }).from(t.orders).where(eq(t.orders.customerId, customerId))));
    // Groups: messages wiped, memberships ended, off every leaderboard. Splits stay (other people's money records) under "Deleted guest".
    await tx.update(t.groupMessage).set({ body: "", hiddenAt: new Date() }).where(eq(t.groupMessage.customerId, customerId));
    await tx.update(t.groupMember).set({ leftAt: new Date() }).where(and(eq(t.groupMember.customerId, customerId), isNull(t.groupMember.leftAt)));
    await tx.update(t.customer).set({ leaderboardOptIn: false, leaderboardName: null, revolutHandle: null }).where(eq(t.customer.id, customerId));
  });
}
