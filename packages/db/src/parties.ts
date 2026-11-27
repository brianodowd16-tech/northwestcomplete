import { CartError, vatFromGross, type PaymentProvider } from "@round/core";
import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { publish, topics, withTenant } from "./index";
import * as t from "./schema";
import { Forbidden, NotFound, ensureMembership, startCheckout, type Customer, type Staff, type Venue } from "./services";

export type PartyPackage = typeof t.partyPackage.$inferSelect;
export type PartyBooking = typeof t.partyBooking.$inferSelect;

export interface PackageInput {
  name: string;
  description?: string;
  pricePerPersonCents: number;
  minGuests: number;
  maxGuests?: number;
  depositPerPersonCents?: number;
  vatRate?: 9 | 23;
  minNoticeDays?: number;
  active?: boolean;
}

function cleanPackage(p: PackageInput) {
  const name = String(p.name ?? "").trim().slice(0, 80);
  if (name.length < 2) throw new CartError("Give the package a name");
  const price = Math.round(Number(p.pricePerPersonCents));
  const min = Math.round(Number(p.minGuests)), max = Math.round(Number(p.maxGuests ?? 200));
  const deposit = Math.round(Number(p.depositPerPersonCents ?? 0));
  if (!(price >= 100 && price <= 100_000)) throw new CartError("Price per person must be between €1 and €1,000");
  if (!(min >= 1 && max >= min && max <= 2000)) throw new CartError("Check the minimum and maximum number of people");
  if (!(deposit >= 0 && deposit <= price)) throw new CartError("The deposit can't be more than the price per person");
  const notice = Math.round(Number(p.minNoticeDays ?? 2));
  if (!(notice >= 0 && notice <= 90)) throw new CartError("Notice must be 0 to 90 days");
  return { name, description: String(p.description ?? "").trim().slice(0, 600), pricePerPersonCents: price, minGuests: min, maxGuests: max, depositPerPersonCents: deposit, vatRate: p.vatRate === 23 ? (23 as const) : (9 as const), minNoticeDays: notice, active: p.active !== false };
}

/** Creates a package, or updates one when `id` is given. */
export async function savePackage(venue: Venue, input: PackageInput, id?: string) {
  const v = cleanPackage(input);
  return withTenant(venue.tenantId, async (tx) => {
    if (id) {
      const [p] = await tx.update(t.partyPackage).set(v).where(and(eq(t.partyPackage.id, id), eq(t.partyPackage.venueId, venue.id))).returning();
      if (!p) throw new NotFound("Package not found");
      return p;
    }
    const [p] = await tx.insert(t.partyPackage).values({ tenantId: venue.tenantId, venueId: venue.id, ...v }).returning();
    return p;
  });
}

export async function packages(venue: Venue, opts: { all?: boolean } = {}) {
  return withTenant(venue.tenantId, (tx) =>
    tx.select().from(t.partyPackage).where(and(eq(t.partyPackage.venueId, venue.id), ...(opts.all ? [] : [eq(t.partyPackage.active, true)]))).orderBy(asc(t.partyPackage.pricePerPersonCents)),
  );
}

/** The price for a party: price per person × guests, and the deposit due now. Checks the package's rules. */
export function quoteParty(p: Pick<PartyPackage, "pricePerPersonCents" | "minGuests" | "maxGuests" | "depositPerPersonCents" | "minNoticeDays" | "active" | "name">, guests: number, startsAt: Date, now = new Date(), opts: { staff?: boolean } = {}) {
  if (!p.active) throw new CartError("That package isn't available");
  if (!Number.isInteger(guests) || guests < p.minGuests) throw new CartError(`${p.name} is for at least ${p.minGuests} people`);
  if (guests > p.maxGuests) throw new CartError(`${p.name} is for up to ${p.maxGuests} people. Call the venue for bigger groups.`);
  if (!(startsAt instanceof Date) || Number.isNaN(startsAt.getTime()) || startsAt.getTime() < now.getTime() + 3_600_000) throw new CartError("Choose a date and time in the future");
  // Staff may take a short-notice booking by phone; guests in the app need the package's notice.
  if (!opts.staff && startsAt.getTime() < now.getTime() + p.minNoticeDays * 86_400_000) throw new CartError(`Book at least ${p.minNoticeDays} day${p.minNoticeDays === 1 ? "" : "s"} ahead`);
  if (startsAt.getTime() > now.getTime() + 366 * 86_400_000) throw new CartError("Book up to a year ahead");
  return { totalCents: p.pricePerPersonCents * guests, depositCents: opts.staff ? 0 : p.depositPerPersonCents * guests };
}

async function pkgFor(venue: Venue, packageId: string) {
  const [p] = await withTenant(venue.tenantId, (tx) => tx.select().from(t.partyPackage).where(and(eq(t.partyPackage.id, packageId), eq(t.partyPackage.venueId, venue.id))));
  if (!p) throw new NotFound("Package not found");
  return p;
}

const clean = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/**
 * A guest books a party in the app. With a deposit, it's paid through the venue's own checkout and
 * reaches staff once the payment is verified; without one it goes straight to staff to confirm.
 * The deposit is an order with one non-menu line at the package's VAT rate; it earns no loyalty.
 */
export async function requestParty(venue: Venue, customer: Customer, input: { packageId: string; startsAt: Date; guests: number; occasion?: string; notes?: string; idempotencyKey: string }, provider: PaymentProvider, appUrl: string) {
  if (venue.status === "suspended") throw new Forbidden(`${venue.name} isn't taking bookings right now`);
  const p = await pkgFor(venue, input.packageId);
  const guests = Number(input.guests);
  const q = quoteParty(p, guests, input.startsAt);
  const key = `party:${clean(input.idempotencyKey, 80)}`;
  if (key.length < 14) throw new CartError("Missing request key");
  const m = q.depositCents ? await ensureMembership(venue, customer.id) : null;

  const res = await withTenant(venue.tenantId, async (tx) => {
    const [dupe] = await tx.select().from(t.orders).where(eq(t.orders.idempotencyKey, key));
    if (dupe) {
      const [b] = await tx.select().from(t.partyBooking).where(eq(t.partyBooking.depositOrderId, dupe.id));
      return { booking: b, order: dupe };
    }
    const open = await tx.select({ id: t.partyBooking.id }).from(t.partyBooking).where(and(eq(t.partyBooking.venueId, venue.id), eq(t.partyBooking.customerId, customer.id), inArray(t.partyBooking.status, ["requested", "confirmed"]), gte(t.partyBooking.startsAt, new Date())));
    if (open.length >= 3) throw new CartError("You already have three party bookings here. Call the venue for more.");
    let order = null;
    if (q.depositCents) {
      const vat = vatFromGross(q.depositCents, p.vatRate as 9 | 23);
      [order] = await tx
        .insert(t.orders)
        .values({
          tenantId: venue.tenantId, venueId: venue.id, channel: "collect", customerId: customer.id, membershipId: m!.id, status: "pending_payment",
          grossCents: q.depositCents, vat9Cents: p.vatRate === 9 ? vat : 0, vat23Cents: p.vatRate === 23 ? vat : 0, amountPaidCents: q.depositCents, rewardableCents: 0, provider: provider.name, idempotencyKey: key,
        })
        .returning();
      await tx.insert(t.orderLine).values({ tenantId: venue.tenantId, orderId: order.id, menuItemId: null, name: `Party deposit: ${p.name}, ${guests} people`.slice(0, 140), qty: 1, unitPriceCents: q.depositCents, grossCents: q.depositCents, vatRate: p.vatRate, vatCents: vat, station: "kitchen", containsAlcohol: false });
    }
    const [b] = await tx
      .insert(t.partyBooking)
      .values({
        tenantId: venue.tenantId, venueId: venue.id, packageId: p.id, customerId: customer.id, contactName: customer.name, contactPhone: customer.phone, contactEmail: customer.email,
        occasion: clean(input.occasion, 80), notes: clean(input.notes, 500), startsAt: input.startsAt, guests, pricePerPersonCents: p.pricePerPersonCents, totalCents: q.totalCents,
        depositCents: q.depositCents, depositOrderId: order?.id ?? null, status: order ? "pending_payment" : "requested",
      })
      .returning();
    if (!order) await publish(tx, topics.venue(venue.id), { kind: "bookings" });
    return { booking: b, order };
  });
  if (!res.order || res.order.status !== "pending_payment") return { booking: res.booking, checkout: null, orderId: res.order?.id ?? null };
  if (res.order.providerToken) return { booking: res.booking, orderId: res.order.id, checkout: { provider: provider.name, token: res.order.providerToken, publicKey: provider.publicKey, redirect: null } };
  const c = await startCheckout(venue, customer, res.order, provider, appUrl);
  return { booking: res.booking, orderId: res.order.id, checkout: c.checkout };
}

/** Staff take a party booking by phone or in person: confirmed straight away, nothing paid online. */
export async function staffBookParty(staff: Staff, venue: Venue, input: { packageId: string; startsAt: Date; guests: number; contactName: string; contactPhone?: string; contactEmail?: string; occasion?: string; notes?: string }) {
  if (staff.venueId !== venue.id) throw new Forbidden("Not your venue");
  const p = await pkgFor(venue, input.packageId);
  const guests = Number(input.guests);
  const q = quoteParty(p, guests, input.startsAt, new Date(), { staff: true });
  const name = clean(input.contactName, 80);
  if (name.length < 2) throw new CartError("Who is the booking for?");
  return withTenant(venue.tenantId, async (tx) => {
    const [b] = await tx
      .insert(t.partyBooking)
      .values({
        tenantId: venue.tenantId, venueId: venue.id, packageId: p.id, staffId: staff.id, contactName: name, contactPhone: clean(input.contactPhone, 30), contactEmail: clean(input.contactEmail, 200),
        occasion: clean(input.occasion, 80), notes: clean(input.notes, 500), startsAt: input.startsAt, guests, pricePerPersonCents: p.pricePerPersonCents, totalCents: q.totalCents, depositCents: 0, status: "confirmed",
      })
      .returning();
    await tx.insert(t.auditLog).values({ tenantId: venue.tenantId, actor: `staff:${staff.id}`, action: "party_booked", entity: `party:${b.id}`, detail: { guests, package: p.name } });
    await publish(tx, topics.venue(venue.id), { kind: "bookings" });
    return b;
  });
}

/** Parties for the staff Bookings screen (with their package), from `from` to `to`. */
export async function venueParties(venue: Venue, from: Date, to: Date) {
  return withTenant(venue.tenantId, (tx) =>
    tx
      .select({ b: t.partyBooking, packageName: t.partyPackage.name })
      .from(t.partyBooking)
      .innerJoin(t.partyPackage, eq(t.partyPackage.id, t.partyBooking.packageId))
      .where(and(eq(t.partyBooking.venueId, venue.id), inArray(t.partyBooking.status, ["requested", "confirmed", "completed"]), gte(t.partyBooking.startsAt, from), lt(t.partyBooking.startsAt, to)))
      .orderBy(asc(t.partyBooking.startsAt)),
  ).then((r) => r.map((x) => ({ ...x.b, packageName: x.packageName })));
}

/**
 * Staff confirm, decline or complete a party. Declining (or cancelling) a paid deposit refunds it at
 * the provider first, so a failed refund leaves the booking as it was.
 */
export async function setPartyStatus(staff: Staff, venue: Venue, id: string, to: "confirmed" | "declined" | "cancelled" | "completed", provider: PaymentProvider) {
  if (staff.venueId !== venue.id) throw new Forbidden("Not your venue");
  const [b] = await withTenant(venue.tenantId, (tx) => tx.select().from(t.partyBooking).where(and(eq(t.partyBooking.id, id), eq(t.partyBooking.venueId, venue.id))));
  if (!b) throw new NotFound("Booking not found");
  const allowed: Record<string, string[]> = { confirmed: ["requested"], declined: ["requested"], cancelled: ["requested", "confirmed"], completed: ["confirmed"] };
  if (!allowed[to].includes(b.status)) throw new Forbidden("That booking can't be changed like that");
  let refunded = false;
  if ((to === "declined" || to === "cancelled") && b.depositOrderId) {
    const [o] = await withTenant(venue.tenantId, (tx) => tx.select().from(t.orders).where(eq(t.orders.id, b.depositOrderId!)));
    if (o?.status === "paid" && o.providerOrderId && o.amountPaidCents > 0) {
      await provider.refund({ providerOrderId: o.providerOrderId, txnRef: o.providerTxnRef, amountCents: o.amountPaidCents }, to === "declined" ? "Party booking declined" : "Party booking cancelled");
      refunded = true;
    }
  }
  await withTenant(venue.tenantId, async (tx) => {
    if (refunded) {
      await tx.update(t.orders).set({ status: "refunded", refundedCents: sql`${t.orders.amountPaidCents}`, refundedAt: new Date() }).where(and(eq(t.orders.id, b.depositOrderId!), eq(t.orders.status, "paid")));
      await publish(tx, topics.order(b.depositOrderId!), { kind: "order" });
    }
    await tx.update(t.partyBooking).set({ status: to }).where(eq(t.partyBooking.id, id));
    await tx.insert(t.auditLog).values({ tenantId: venue.tenantId, actor: `staff:${staff.id}`, action: `party_${to}`, entity: `party:${id}`, detail: { refunded } });
    await publish(tx, topics.venue(venue.id), { kind: "bookings" });
  });
  return { refunded };
}

/** A guest's own party bookings at a venue (upcoming and recent). */
export async function myParties(venue: Venue, customerId: string) {
  return withTenant(venue.tenantId, (tx) =>
    tx
      .select({ b: t.partyBooking, packageName: t.partyPackage.name })
      .from(t.partyBooking)
      .innerJoin(t.partyPackage, eq(t.partyPackage.id, t.partyBooking.packageId))
      .where(and(eq(t.partyBooking.venueId, venue.id), eq(t.partyBooking.customerId, customerId), inArray(t.partyBooking.status, ["requested", "confirmed", "declined", "cancelled"]), gte(t.partyBooking.startsAt, new Date(Date.now() - 86_400_000))))
      .orderBy(asc(t.partyBooking.startsAt)),
  ).then((r) => r.map((x) => ({ ...x.b, packageName: x.packageName })));
}

/** A guest cancels their own request before staff confirm it (refunded in full). */
export async function cancelMyParty(venue: Venue, customer: Customer, id: string, provider: PaymentProvider) {
  const [b] = await withTenant(venue.tenantId, (tx) => tx.select().from(t.partyBooking).where(and(eq(t.partyBooking.id, id), eq(t.partyBooking.venueId, venue.id), eq(t.partyBooking.customerId, customer.id))));
  if (!b) throw new NotFound("Booking not found");
  if (b.status !== "requested") throw new Forbidden(b.status === "confirmed" ? "It's confirmed: call the venue to change or cancel it" : "That booking can't be cancelled");
  if (b.depositOrderId) {
    const [o] = await withTenant(venue.tenantId, (tx) => tx.select().from(t.orders).where(eq(t.orders.id, b.depositOrderId!)));
    if (o?.status === "paid" && o.providerOrderId && o.amountPaidCents > 0) await provider.refund({ providerOrderId: o.providerOrderId, txnRef: o.providerTxnRef, amountCents: o.amountPaidCents }, "Party request cancelled by guest");
  }
  await withTenant(venue.tenantId, async (tx) => {
    if (b.depositOrderId) await tx.update(t.orders).set({ status: "refunded", refundedCents: sql`${t.orders.amountPaidCents}`, refundedAt: new Date() }).where(and(eq(t.orders.id, b.depositOrderId), eq(t.orders.status, "paid")));
    await tx.update(t.partyBooking).set({ status: "cancelled" }).where(eq(t.partyBooking.id, id));
    await publish(tx, topics.venue(venue.id), { kind: "bookings" });
  });
}
