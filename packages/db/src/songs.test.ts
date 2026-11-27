import { MockProvider } from "@round/core";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool, systemDb } from "./index";
import * as t from "./schema";
import { seed } from "./seed";
import * as svc from "./services";
import { resetDatabase } from "./setup";
import * as songs from "./songs";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://round:round@localhost:5432/round_test";
const provider = new MockProvider();
let mj: svc.Venue, guest: svc.Customer, staff: svc.Staff;

beforeAll(async () => {
  await seed(await resetDatabase());
  mj = await svc.venueBySlug("mj-oconnors");
  guest = await svc.createCustomer({ phone: "+353871119001", name: "Ciara Lynch", email: "c@x.ie", dateOfBirth: "1992-02-02", marketingConsent: false });
  staff = (await svc.staffByEmail("staff@mjoconnors.example"))!;
});
afterAll(() => pool().end());

const pay = async (o: svc.Order) => {
  const { rawBody, headers } = provider.simulatePayment(o.providerOrderId!);
  return svc.handleWebhook(provider, rawBody, headers, mj);
};

describe("paid song requests", () => {
  it("is off until a manager sets a price", async () => {
    await expect(songs.requestPaidSong(mj, guest, { title: "Galway Girl", idempotencyKey: "k-off-0001" }, provider, "https://app.test")).rejects.toThrow(/isn't taking paid/);
    await expect(songs.setSongPrice(mj, 5)).rejects.toThrow();
    await songs.setSongPrice(mj, 200);
    mj = await svc.venueBySlug("mj-oconnors");
  });

  it("reaches the bar only after a verified payment, earns nothing, then accept & queue", async () => {
    const { order, checkout } = await songs.requestPaidSong(mj, guest, { title: "Galway Girl", idempotencyKey: "k-song-0001" }, provider, "https://app.test");
    expect(checkout).not.toBeNull();
    expect(order).toMatchObject({ grossCents: 200, vat23Cents: 37, vat9Cents: 0, rewardableCents: 0 });
    expect((await songs.songQueue(staff)).waiting).toHaveLength(0); // not paid yet
    await pay(order);
    const q = await songs.songQueue(staff);
    expect(q.waiting).toMatchObject([{ title: "Galway Girl", paidCents: 200, status: "requested" }]);
    expect(await systemDb().select().from(t.docket).where(eq(t.docket.orderId, order.id))).toHaveLength(0);
    expect(await systemDb().select().from(t.loyaltyLedger).where(eq(t.loyaltyLedger.orderId, order.id))).toHaveLength(0);
    await songs.queueSong(staff, q.waiting[0].id);
    await expect(songs.queueSong(staff, q.waiting[0].id)).rejects.toThrow(/Already/);
    expect((await songs.mySongs(mj, guest.id))[0]).toMatchObject({ status: "queued", position: 1 });
    await songs.playedSong(staff, q.waiting[0].id);
    expect((await songs.songQueue(staff)).done[0].status).toBe("played");
  });

  it("is idempotent by request key", async () => {
    const one = await songs.requestPaidSong(mj, guest, { title: "Zombie", idempotencyKey: "k-song-0002" }, provider, "https://app.test");
    const two = await songs.requestPaidSong(mj, guest, { title: "Zombie", idempotencyKey: "k-song-0002" }, provider, "https://app.test");
    expect(two.order.id).toBe(one.order.id);
    await pay(one.order);
  });

  it("declining a paid request refunds it at the provider first", async () => {
    const id = (await songs.songQueue(staff)).waiting.find((s) => s.title === "Zombie")!.id;
    expect(await songs.declineSong(staff, id, provider)).toBe("refunded");
    const [s] = await systemDb().select().from(t.songRequest).where(eq(t.songRequest.id, id));
    const [o] = await systemDb().select().from(t.orders).where(eq(t.orders.id, s.orderId!));
    expect([s.status, o.status, o.refundedCents]).toEqual(["refunded", "refunded", 200]);
  });

  it("limits each guest to three requests every half hour", async () => {
    await songs.requestPaidSong(mj, guest, { title: "Third", idempotencyKey: "k-song-0003" }, provider, "https://app.test");
    await expect(songs.requestPaidSong(mj, guest, { title: "One more", idempotencyKey: "k-song-0004" }, provider, "https://app.test")).rejects.toThrow(/Three requests/);
  });
});
