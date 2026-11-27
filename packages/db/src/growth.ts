import { CartError, priceCart, seatsLeft } from "@round/core";
import { and, asc, eq, gte, inArray, isNull, lt, ne, notInArray, sql } from "drizzle-orm";
import { publish, systemDb, topics, withTenant } from "./index";
import { depleteForOrder } from "./inventory";
import * as t from "./schema";
import { Forbidden, NotFound, toPriced, type Customer, type Staff, type Venue } from "./services";

// ---------------------------------------------------------------- guest hub (one account, every venue)

/** The guest's points and credit at every venue they've joined. Reads only this guest's own rows. */
export async function guestHub(customerId: string) {
  const db = systemDb();
  const ms = await db.select().from(t.membership).where(eq(t.membership.customerId, customerId));
  if (!ms.length) return [];
  const venues = await db.select().from(t.venue).where(and(inArray(t.venue.programmeId, ms.map((m) => m.programmeId)), eq(t.venue.status, "live")));
  const sums = await db
    .select({ m: t.loyaltyLedger.membershipId, kind: t.loyaltyLedger.kind, total: sql<number>`sum(${t.loyaltyLedger.delta})::int` })
    .from(t.loyaltyLedger)
    .where(inArray(t.loyaltyLedger.membershipId, ms.map((m) => m.id)))
    .groupBy(t.loyaltyLedger.membershipId, t.loyaltyLedger.kind);
  return venues.map((v) => {
    const m = ms.find((x) => x.programmeId === v.programmeId)!;
    const get = (k: string) => sums.find((s) => s.m === m.id && s.kind === k)?.total ?? 0;
    return { venue: v, points: get("points"), creditCents: get("credit") };
  });
}

// ---------------------------------------------------------------- bookings

const MAX_PARTY = 20;

export async function createBooking(venue: Venue, customer: Customer, input: { startsAt: Date; partySize: number; note?: string; eventKey?: string | null; eventTitle?: string | null }) {
  if (!venue.bookingSeatsPerSlot) throw new Forbidden(`${venue.name} doesn't take table bookings in the app`);
  const party = Number(input.partySize);
  if (!Number.isInteger(party) || party < 1 || party > MAX_PARTY) throw new CartError(`Party size must be 1 to ${MAX_PARTY}. Call the venue for bigger groups.`);
  const at = input.startsAt;
  if (!(at instanceof Date) || Number.isNaN(at.getTime()) || at.getTime() < Date.now() + 15 * 60_000) throw new CartError("Choose a time at least 15 minutes from now");
  if (at.getTime() > Date.now() + venue.bookingMaxAdvanceDays * 86_400_000) throw new CartError(`You can book up to ${venue.bookingMaxAdvanceDays} days ahead`);
  if (at.getUTCMinutes() % 30 !== 0) throw new CartError("Choose a time on the hour or half hour");
  return withTenant(venue.tenantId, async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${venue.id}))`); // one booking at a time per venue: no overbooking
    const near = await tx
      .select()
      .from(t.booking)
      .where(and(eq(t.booking.venueId, venue.id), gte(t.booking.startsAt, new Date(at.getTime() - 3 * 3_600_000)), lt(t.booking.startsAt, new Date(at.getTime() + 3 * 3_600_000))));
    if (near.some((b) => b.customerId === customer.id && b.status === "confirmed" && Math.abs(b.startsAt.getTime() - at.getTime()) < 3 * 3_600_000))
      throw new CartError("You already have a booking around then");
    if (seatsLeft(venue.bookingSeatsPerSlot, near, at) < party) throw new CartError("That time is fully booked. Try another time.");
    const [b] = await tx
      .insert(t.booking)
      .values({ tenantId: venue.tenantId, venueId: venue.id, customerId: customer.id, partySize: party, startsAt: at, note: String(input.note ?? "").slice(0, 200), eventKey: input.eventKey ?? null, eventTitle: input.eventTitle ? String(input.eventTitle).slice(0, 120) : null })
      .returning();
    await publish(tx, topics.venue(venue.id), { kind: "bookings" });
    return b;
  });
}

export async function myBookings(venue: Venue, customerId: string) {
  return withTenant(venue.tenantId, (tx) =>
    tx.select().from(t.booking).where(and(eq(t.booking.venueId, venue.id), eq(t.booking.customerId, customerId), gte(t.booking.startsAt, new Date(Date.now() - 3 * 3_600_000)))).orderBy(asc(t.booking.startsAt)),
  );
}

export async function cancelMyBooking(venue: Venue, customerId: string, id: string) {
  await withTenant(venue.tenantId, async (tx) => {
    const r = await tx.update(t.booking).set({ status: "cancelled" }).where(and(eq(t.booking.id, id), eq(t.booking.customerId, customerId), eq(t.booking.status, "confirmed"))).returning();
    if (!r.length) throw new NotFound("Booking not found");
  });
}

export async function venueBookings(venue: Venue, from: Date, to: Date) {
  return withTenant(venue.tenantId, async (tx) => {
    const bs = await tx.select().from(t.booking).where(and(eq(t.booking.venueId, venue.id), gte(t.booking.startsAt, from), lt(t.booking.startsAt, to))).orderBy(asc(t.booking.startsAt));
    const cs = bs.length ? await tx.select({ id: t.customer.id, name: t.customer.name, phone: t.customer.phone }).from(t.customer).where(inArray(t.customer.id, bs.map((b) => b.customerId))) : [];
    return bs.map((b) => ({ ...b, guest: cs.find((c) => c.id === b.customerId) ?? { name: "Guest", phone: "" } }));
  });
}

export async function setBookingStatus(staff: Staff, id: string, status: "seated" | "no_show" | "cancelled") {
  await withTenant(staff.tenantId, async (tx) => {
    const r = await tx.update(t.booking).set({ status }).where(and(eq(t.booking.id, id), eq(t.booking.venueId, staff.venueId))).returning();
    if (!r.length) throw new NotFound("Booking not found");
  });
}

export async function setBookingCapacity(venue: Venue, seats: number) {
  if (!Number.isInteger(seats) || seats < 0 || seats > 2000) throw new CartError("Seats must be a whole number");
  await withTenant(venue.tenantId, (tx) => tx.update(t.venue).set({ bookingSeatsPerSlot: seats }).where(eq(t.venue.id, venue.id)));
}

// ---------------------------------------------------------------- shifts and labour

export async function openShift(staff: Staff) {
  const [s] = await withTenant(staff.tenantId, (tx) => tx.select().from(t.staffShift).where(and(eq(t.staffShift.staffId, staff.id), isNull(t.staffShift.clockOut))));
  return s ?? null;
}

export async function clock(staff: Staff, action: "in" | "out") {
  return withTenant(staff.tenantId, async (tx) => {
    const [open] = await tx.select().from(t.staffShift).where(and(eq(t.staffShift.staffId, staff.id), isNull(t.staffShift.clockOut)));
    if (action === "in") {
      if (open) return open;
      const [s] = await tx.insert(t.staffShift).values({ tenantId: staff.tenantId, venueId: staff.venueId, staffId: staff.id, hourlyRateCents: staff.hourlyRateCents }).returning();
      return s;
    }
    if (!open) throw new CartError("You're not clocked in");
    const [s] = await tx.update(t.staffShift).set({ clockOut: new Date() }).where(eq(t.staffShift.id, open.id)).returning();
    return s;
  });
}

export async function shifts(venue: Venue, from: Date, to: Date) {
  return withTenant(venue.tenantId, async (tx) => {
    const rows = await tx.select({ s: t.staffShift, name: t.staffUser.name, email: t.staffUser.email }).from(t.staffShift).innerJoin(t.staffUser, eq(t.staffUser.id, t.staffShift.staffId)).where(and(eq(t.staffShift.venueId, venue.id), gte(t.staffShift.clockIn, from), lt(t.staffShift.clockIn, to))).orderBy(asc(t.staffShift.clockIn));
    return rows.map((r) => ({ ...r.s, name: r.name, email: r.email }));
  });
}

export async function setHourlyRate(venue: Venue, staffId: string, cents: number) {
  if (!Number.isInteger(cents) || cents < 0 || cents > 100_000) throw new CartError("Enter an hourly rate");
  await withTenant(venue.tenantId, async (tx) => {
    const r = await tx.update(t.staffUser).set({ hourlyRateCents: cents }).where(and(eq(t.staffUser.id, staffId), eq(t.staffUser.venueId, venue.id))).returning();
    if (!r.length) throw new NotFound("Not found");
  });
}

// ---------------------------------------------------------------- planner + funding data

/** Paid orders (all channels) over the last `weeks`, for the forecast. */
export async function salesHistory(venue: Venue, weeks = 8) {
  return withTenant(venue.tenantId, (tx) =>
    tx
      .select({ at: t.orders.paidAt, cents: t.orders.grossCents })
      .from(t.orders)
      .where(and(eq(t.orders.venueId, venue.id), eq(t.orders.status, "paid"), gte(t.orders.paidAt, new Date(Date.now() - weeks * 7 * 86_400_000)))),
  ).then((rows) => rows.filter((r) => r.at).map((r) => ({ at: r.at!, cents: r.cents })));
}

/** Card takings over the last 90 days (app + till card), net of refunds, excluding test payments. */
export async function cardTakings90d(venue: Venue) {
  const [r] = await withTenant(venue.tenantId, (tx) =>
    tx
      .select({ c: sql<number>`coalesce(sum(${t.orders.amountPaidCents} - ${t.orders.refundedCents}),0)::int` })
      .from(t.orders)
      .where(and(eq(t.orders.venueId, venue.id), inArray(t.orders.status, ["paid", "refunded"]), notInArray(t.orders.provider, ["cash", "mock", "room"]), gte(t.orders.paidAt, new Date(Date.now() - 90 * 86_400_000)))),
  );
  return r.c;
}

export async function applyPrice(venue: Venue, menuItemId: string, priceCents: number) {
  if (!Number.isInteger(priceCents) || priceCents < 10 || priceCents > 1_000_000) throw new CartError("Invalid price");
  await withTenant(venue.tenantId, async (tx) => {
    const r = await tx.update(t.menuItem).set({ priceCents }).where(and(eq(t.menuItem.id, menuItemId), eq(t.menuItem.venueId, venue.id))).returning();
    if (!r.length) throw new NotFound("Item not found");
    await tx.insert(t.auditLog).values({ tenantId: venue.tenantId, actor: "planner", action: "price_change", entity: `menu_item:${menuItemId}`, detail: { priceCents } });
    await publish(tx, topics.venue(venue.id), { kind: "menu" });
  });
}

// ---------------------------------------------------------------- delivery platforms

/**
 * An order from a delivery platform (via an aggregator such as Deliverect, or a platform's own API).
 * Paid on the platform; priced from the venue's own menu; both stations get dockets; stock goes down.
 * Idempotent by the platform's order id.
 */
export async function ringUpDelivery(venue: Venue, input: { platform: string; externalId: string; customerName?: string; items: { plu?: string; name?: string; qty: number }[] }, opts: { skipUnknown?: boolean } = {}) {
  const platform = String(input.platform ?? "").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 30);
  if (!platform || !input.externalId) throw new CartError("Missing platform or order id");
  return withTenant(venue.tenantId, async (tx) => {
    const key = `delivery:${platform}:${input.externalId}`;
    const [dup] = await tx.select().from(t.orders).where(eq(t.orders.idempotencyKey, key));
    if (dup) return { order: dup, repeat: true };
    const menu = await tx.select().from(t.menuItem).where(eq(t.menuItem.venueId, venue.id));
    const find = (i: { plu?: string; name?: string }) =>
      menu.find((m) => (i.plu && m.externalItemId === i.plu) || (i.plu && m.id === i.plu)) ?? menu.find((m) => i.name && m.name.toLowerCase() === i.name.trim().toLowerCase());
    const unknown = input.items.filter((i) => !find(i)).map((i) => i.plu ?? i.name);
    if (unknown.length && !opts.skipUnknown) throw new CartError(`Not on the menu: ${unknown.join(", ")}`);
    input = { ...input, items: input.items.filter((i) => find(i)) }; // shops sell things that aren't on the menu (vouchers, merch)
    if (!input.items.length) return { order: null, repeat: false };
    const priced = new Map(menu.map((m) => [m.id, { ...toPriced(m), soldOut: false }])); // the platform already accepted it
    const cart = priceCart(priced, input.items.map((i) => ({ menuItemId: find(i)!.id, qty: Number(i.qty) })), "delivery");
    const [order] = await tx
      .insert(t.orders)
      .values({
        tenantId: venue.tenantId, venueId: venue.id, channel: "delivery", customerId: null, membershipId: null, status: "paid",
        grossCents: cart.grossCents, vat9Cents: cart.vat9Cents, vat23Cents: cart.vat23Cents, creditUsedCents: 0, amountPaidCents: cart.grossCents,
        provider: platform, externalRef: String(input.externalId).slice(0, 80), idempotencyKey: key, paidAt: new Date(),
      })
      .returning();
    await tx.insert(t.orderLine).values(cart.lines.map((l) => ({ tenantId: venue.tenantId, orderId: order.id, menuItemId: l.menuItem.id, name: l.menuItem.name, qty: l.qty, unitPriceCents: l.unitPriceCents, grossCents: l.grossCents, vatRate: l.vatRate, vatCents: l.vatCents, station: l.menuItem.station, containsAlcohol: l.menuItem.containsAlcohol })));
    for (const st of [...new Set(cart.lines.map((l) => l.menuItem.station))]) await tx.insert(t.docket).values({ tenantId: venue.tenantId, venueId: venue.id, orderId: order.id, station: st });
    await depleteForOrder(tx, venue.tenantId, venue.id, order.id);
    await publish(tx, topics.venue(venue.id), { kind: "dockets" });
    return { order, repeat: false };
  });
}

// ---------------------------------------------------------------- drinks brands

/**
 * Anonymised sales for drinks brands: units by item across venues that opted in, only where at least
 * `minVenues` venues sold it (so no single venue can be identified). Never guest data.
 */
export async function brandInsights(from: Date, to: Date, minVenues = 3) {
  const rows = await systemDb()
    .select({ name: sql<string>`lower(${t.orderLine.name})`, venues: sql<number>`count(distinct ${t.orders.venueId})::int`, units: sql<number>`sum(${t.orderLine.qty})::int` })
    .from(t.orderLine)
    .innerJoin(t.orders, eq(t.orders.id, t.orderLine.orderId))
    .innerJoin(t.venue, eq(t.venue.id, t.orders.venueId))
    .where(and(eq(t.venue.shareBrandInsights, true), eq(t.orders.status, "paid"), ne(t.orders.provider, "mock"), gte(t.orders.paidAt, from), lt(t.orders.paidAt, to)))
    .groupBy(sql`lower(${t.orderLine.name})`);
  return rows.filter((r) => r.venues >= minVenues).sort((a, b) => b.units - a.units);
}

export async function setBrandSharing(venue: Venue, on: boolean) {
  await withTenant(venue.tenantId, (tx) => tx.update(t.venue).set({ shareBrandInsights: on }).where(eq(t.venue.id, venue.id)));
}
