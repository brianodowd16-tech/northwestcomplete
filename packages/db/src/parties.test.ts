import { MockProvider } from "@round/core";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool, systemDb } from "./index";
import * as p from "./parties";
import * as t from "./schema";
import { seed } from "./seed";
import * as svc from "./services";
import { resetDatabase } from "./setup";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://round:round@localhost:5432/round_test";
const provider = new MockProvider();
let mj: svc.Venue, guest: svc.Customer, staff: svc.Staff, pkg: p.PartyPackage;
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000);

beforeAll(async () => {
  await seed(await resetDatabase());
  mj = await svc.venueBySlug("mj-oconnors");
  guest = await svc.createCustomer({ phone: "+353871117001", name: "Orla Ryan", email: "orla@x.ie", dateOfBirth: "1991-01-01", marketingConsent: false });
  staff = (await svc.staffByEmail("staff@mjoconnors.example"))!;
  pkg = (await p.packages(mj)).find((x) => x.name === "Party package")!;
});
afterAll(() => pool().end());

describe("party packages", () => {
  it("prices €30 a head with a 20-person minimum and the package's notice", () => {
    expect(p.quoteParty(pkg, 25, inDays(10))).toEqual({ totalCents: 75000, depositCents: 12500 });
    expect(() => p.quoteParty(pkg, 19, inDays(10))).toThrow(/at least 20/);
    expect(() => p.quoteParty(pkg, 25, inDays(1))).toThrow(/3 days ahead/);
    expect(p.quoteParty(pkg, 25, inDays(1), new Date(), { staff: true })).toEqual({ totalCents: 75000, depositCents: 0 });
  });

  it("checks what managers enter", async () => {
    await expect(p.savePackage(mj, { name: "Cheap", pricePerPersonCents: 50, minGuests: 10 })).rejects.toThrow(/between €1/);
    await expect(p.savePackage(mj, { name: "Odd", pricePerPersonCents: 2000, minGuests: 10, depositPerPersonCents: 3000 })).rejects.toThrow(/deposit/);
    const x = await p.savePackage(mj, { name: "Christmas party", pricePerPersonCents: 4000, minGuests: 15, depositPerPersonCents: 1000, vatRate: 9 });
    expect(x).toMatchObject({ pricePerPersonCents: 4000, minGuests: 15, active: true });
  });
});

describe("party bookings", () => {
  let bookingId = "";
  it("a guest's deposit goes through the venue checkout; staff see it once paid", async () => {
    const r = await p.requestParty(mj, guest, { packageId: pkg.id, startsAt: inDays(10), guests: 24, occasion: "40th", idempotencyKey: "k-party-0001" }, provider, "https://app.test");
    bookingId = r.booking.id;
    expect(r.booking).toMatchObject({ status: "pending_payment", totalCents: 72000, depositCents: 12000 });
    expect(r.checkout).not.toBeNull();
    const again = await p.requestParty(mj, guest, { packageId: pkg.id, startsAt: inDays(10), guests: 24, idempotencyKey: "k-party-0001" }, provider, "https://app.test");
    expect(again.booking.id).toBe(bookingId);
    const [o] = await systemDb().select().from(t.orders).where(eq(t.orders.id, r.orderId!));
    expect(o).toMatchObject({ grossCents: 12000, vat9Cents: 991, rewardableCents: 0 });
    expect((await p.venueParties(mj, new Date(), inDays(60))).map((b) => b.id)).not.toContain(bookingId);
    const { rawBody, headers } = provider.simulatePayment(o.providerOrderId!);
    await svc.handleWebhook(provider, rawBody, headers, mj);
    expect((await p.venueParties(mj, new Date(), inDays(60))).find((b) => b.id === bookingId)).toMatchObject({ status: "requested", packageName: "Party package" });
    expect(await systemDb().select().from(t.docket).where(eq(t.docket.orderId, o.id))).toHaveLength(0);
    expect(await systemDb().select().from(t.loyaltyLedger).where(eq(t.loyaltyLedger.orderId, o.id))).toHaveLength(0);
  });

  it("staff confirm, then a cancellation refunds the deposit", async () => {
    await p.setPartyStatus(staff, mj, bookingId, "confirmed", provider);
    await expect(p.cancelMyParty(mj, guest, bookingId, provider)).rejects.toThrow(/call the venue/);
    expect(await p.setPartyStatus(staff, mj, bookingId, "cancelled", provider)).toEqual({ refunded: true });
    const [b] = await systemDb().select().from(t.partyBooking).where(eq(t.partyBooking.id, bookingId));
    const [o] = await systemDb().select().from(t.orders).where(eq(t.orders.id, b.depositOrderId!));
    expect([b.status, o.status, o.refundedCents]).toEqual(["cancelled", "refunded", 12000]);
  });

  it("no-deposit packages go straight to staff; staff phone bookings are confirmed at once", async () => {
    const match = (await p.packages(mj)).find((x) => x.name === "Match day package")!;
    const r = await p.requestParty(mj, guest, { packageId: match.id, startsAt: inDays(3), guests: 10, idempotencyKey: "k-party-0002" }, provider, "https://app.test");
    expect([r.booking.status, r.checkout]).toEqual(["requested", null]);
    const phone = await p.staffBookParty(staff, mj, { packageId: pkg.id, startsAt: inDays(1), guests: 30, contactName: "Declan Murphy", contactPhone: "087 000 0000" });
    expect(phone).toMatchObject({ status: "confirmed", totalCents: 90000, depositCents: 0, staffId: staff.id });
    expect((await p.myParties(mj, guest.id)).map((b) => b.status)).toEqual(["requested", "cancelled"]);
  });
});
