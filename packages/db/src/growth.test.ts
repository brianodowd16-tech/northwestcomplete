import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as g from "./growth";
import { pool, systemDb } from "./index";
import * as inv from "./inventory";
import * as t from "./schema";
import { seed } from "./seed";
import * as svc from "./services";
import { resetDatabase } from "./setup";
import * as till from "./till";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://round:round@localhost:5432/round_test";
let mj: svc.Venue, drum: svc.Venue, staff: svc.Staff, guest: svc.Customer, ids: Record<string, string>;
const slot = (daysAhead: number, hh: number) => { const d = new Date(Date.now() + daysAhead * 86_400_000); d.setUTCHours(hh, 0, 0, 0); return d; };

beforeAll(async () => {
  await seed(await resetDatabase());
  await systemDb().update(t.venue).set({ bookingSeatsPerSlot: 10 }).where(eq(t.venue.slug, "mj-oconnors"));
  mj = await svc.venueBySlug("mj-oconnors");
  drum = await svc.venueBySlug("drumhierny");
  staff = (await svc.staffByEmail("staff@mjoconnors.example"))!;
  guest = await svc.createCustomer({ phone: "+353870004001", name: "Orla Byrne", email: "o@example.com", dateOfBirth: "1990-01-01", marketingConsent: false });
  ids = Object.fromEntries((await svc.menu(mj)).flatMap((c) => c.items).map((i) => [i.name, i.id]));
});
afterAll(() => pool().end());

describe("guest hub", () => {
  it("shows the guest's points and credit at every venue they joined", async () => {
    await svc.ensureMembership(mj, guest.id);
    await svc.ensureMembership(drum, guest.id);
    const hub = await g.guestHub(guest.id);
    expect(hub.map((h) => h.venue.slug).sort()).toEqual(["drumhierny", "mj-oconnors"]);
    expect(hub[0].creditCents).toBe(1000);
  });
});

describe("bookings", () => {
  it("books within capacity, refuses double bookings and full slots", async () => {
    const at = slot(2, 19);
    const b = await g.createBooking(mj, guest, { startsAt: at, partySize: 6, eventKey: "sport:x", eventTitle: "Leinster v Munster" });
    expect(b).toMatchObject({ partySize: 6, status: "confirmed", eventTitle: "Leinster v Munster" });
    await expect(g.createBooking(mj, guest, { startsAt: at, partySize: 2 })).rejects.toThrow(/already have a booking/);
    const other = await svc.createCustomer({ phone: "+353870004002", name: "Seán Kelly", email: "s@example.com", dateOfBirth: "1990-01-01", marketingConsent: false });
    await expect(g.createBooking(mj, other, { startsAt: at, partySize: 5 })).rejects.toThrow(/fully booked/);
    await g.createBooking(mj, other, { startsAt: at, partySize: 4 });
    await expect(g.createBooking(drum, guest, { startsAt: at, partySize: 2 })).rejects.toThrow(/doesn't take table bookings/);
    await g.setBookingStatus(staff, b.id, "seated");
    expect((await g.venueBookings(mj, slot(2, 0), slot(3, 0)))[0]).toMatchObject({ status: "seated", guest: { name: "Orla Byrne" } });
  });
});

describe("shifts", () => {
  it("clocks in and out", async () => {
    await g.setHourlyRate(mj, staff.id, 1500);
    const s1 = await g.clock({ ...staff, hourlyRateCents: 1500 }, "in");
    expect((await g.clock({ ...staff, hourlyRateCents: 1500 }, "in")).id).toBe(s1.id);
    const s2 = await g.clock(staff, "out");
    expect(s2.clockOut).not.toBeNull();
    expect(s2.hourlyRateCents).toBe(1500);
    await expect(g.clock(staff, "out")).rejects.toThrow(/not clocked in/);
  });
});

describe("delivery and room charges", () => {
  it("takes a delivery order once, with dockets and stock", async () => {
    const keg = async () => (await inv.stockLevels(mj)).items.find((i) => i.name === "Stout keg")!.onHand;
    const before = await keg();
    const r = await g.ringUpDelivery(mj, { platform: "Deliveroo", externalId: "DR-1", items: [{ name: "Fish & chips", qty: 1 }, { name: "pint of stout", qty: 2 }] });
    expect(r.order).toMatchObject({ channel: "delivery", provider: "deliveroo", amountPaidCents: 1700 + 1240 });
    expect((await g.ringUpDelivery(mj, { platform: "Deliveroo", externalId: "DR-1", items: [{ name: "Fish & chips", qty: 1 }] })).repeat).toBe(true);
    expect(await keg()).toBe(before - 1136);
    await expect(g.ringUpDelivery(mj, { platform: "justeat", externalId: "JE-1", items: [{ name: "Unicorn steak", qty: 1 }] })).rejects.toThrow(/Not on the menu/);
  });
  it("charges to a room only at hotels", async () => {
    await expect(till.ringUpSale(mj, staff, { key: "room-00001", lines: [{ menuItemId: ids["Pint of stout"], qty: 1 }], method: "room", roomNumber: "12" })).rejects.toThrow(/hotels/);
  });
});

describe("brand insights", () => {
  it("only shares items sold at enough opted-in venues", async () => {
    await g.setBrandSharing(mj, true);
    expect(await g.brandInsights(new Date(Date.now() - 86_400_000), new Date(Date.now() + 60_000), 1)).not.toHaveLength(0);
    expect(await g.brandInsights(new Date(Date.now() - 86_400_000), new Date(Date.now() + 60_000), 3)).toHaveLength(0);
  });
});
