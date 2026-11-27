import { MockProvider, trybeBooking, type WooOrder } from "@round/core";
import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as c from "./connect";
import { pool, systemDb } from "./index";
import * as t from "./schema";
import { seed } from "./seed";
import * as svc from "./services";
import { resetDatabase } from "./setup";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://round:round@localhost:5432/round_test";
const KEY = randomBytes(32).toString("base64");
const provider = new MockProvider();
let mj: svc.Venue, drum: svc.Venue;

beforeAll(async () => {
  await seed(await resetDatabase());
  mj = await svc.venueBySlug("mj-oconnors");
  drum = await svc.venueBySlug("drumhierny");
});
afterAll(() => pool().end());

describe("connections", () => {
  it("stores keys encrypted, keeps blank fields, never exposes values", async () => {
    await c.saveConnection(mj, "woocommerce", { store: "https://shop.example.ie" }, { consumerKey: "ck_1", consumerSecret: "cs_1", webhookSecret: "whs" }, KEY);
    await c.saveConnection(mj, "woocommerce", { store: "https://shop.example.ie" }, { consumerKey: "", consumerSecret: "cs_2", webhookSecret: "" }, KEY);
    expect((await c.connection(mj, "woocommerce", KEY))!.secrets).toEqual({ consumerKey: "ck_1", consumerSecret: "cs_2", webhookSecret: "whs" });
    const st = await c.connectionStatus(mj, KEY);
    expect(st.woocommerce!.has.sort()).toEqual(["consumerKey", "consumerSecret", "webhookSecret"]);
    expect(JSON.stringify(st)).not.toContain("cs_2");
    const [row] = await systemDb().select().from(t.venueIntegration).where(eq(t.venueIntegration.kind, "woocommerce"));
    expect(row.secretEnc).not.toContain("cs_2");
    expect(() => c.checkStoreUrl("http://localhost:8080")).toThrow();
  });

  it("imports paid shop orders: menu items only, once", async () => {
    const item = (await svc.menu(mj)).flatMap((x) => x.items)[0];
    const o: WooOrder = { id: 9001, status: "processing", currency: "EUR", total: "50.00", line_items: [{ sku: null, name: item.name, quantity: 2, total: "0", total_tax: "0" }, { sku: "VOUCHER50", name: "Gift voucher", quantity: 1, total: "50", total_tax: "0" }] };
    expect(await c.importWooOrder(mj, { ...o, status: "pending" })).toBe("not_paid");
    expect(await c.importWooOrder(mj, o)).toBe("imported");
    expect(await c.importWooOrder(mj, o)).toBe("repeat");
    const [order] = await systemDb().select().from(t.orders).where(eq(t.orders.idempotencyKey, "delivery:woocommerce:9001"));
    expect(order).toMatchObject({ provider: "woocommerce", status: "paid", grossCents: item.priceCents * 2 });
    expect(await c.importWooOrder(mj, { ...o, id: 9002, line_items: [o.line_items[1]] })).toBe("nothing_on_menu");
  });

  it("keeps Trybe bookings current and shows them to the right guest only", async () => {
    const at = new Date(Date.now() + 86_400_000).toISOString();
    await c.savePartnerBooking(drum, trybeBooking({ id: "tb1", order_ref: "TRY01", first_name: "Aoife", last_name: "Byrne", email: "aoife@x.ie", booking_items_start_date: at, booking_items: [{ offering_name: "Hot tub" }] }));
    await c.savePartnerBooking(drum, trybeBooking({ id: "tb1", order_ref: "TRY01", first_name: "Aoife", last_name: "Byrne", email: "aoife@x.ie", booking_items_start_date: at, booking_items: [{ offering_name: "Hot tub" }, { offering_name: "Sauna" }] }));
    expect(await c.guestPartnerBookings("AOIFE@x.ie", "Aoife Byrne")).toMatchObject([{ venueName: drum.name, items: ["Hot tub", "Sauna"], ref: "TRY01" }]);
    expect(await c.guestPartnerBookings("aoife@x.ie", "Somebody Else")).toEqual([]);
    expect(await c.partnerBookings(drum, new Date(), new Date(Date.now() + 2 * 86_400_000))).toHaveLength(1);
    await c.savePartnerBooking(drum, trybeBooking({ id: "tb1", first_name: "Aoife", email: "aoife@x.ie" }, true));
    expect(await c.partnerBookings(drum, new Date(), new Date(Date.now() + 2 * 86_400_000))).toHaveLength(0);
  });

  it("totals a day's card takings by provider, net of refunds", async () => {
    const before = await c.dayCardTakings(mj, new Date().toLocaleDateString("en-CA", { timeZone: mj.timezone }));
    const g = await svc.createCustomer({ phone: "+353871118001", name: "Test Guest", email: "t@x.ie", dateOfBirth: "1990-01-01", marketingConsent: false });
    const item = (await svc.menu(mj)).flatMap((x) => x.items).find((i) => !i.containsAlcohol)!;
    const { order } = await svc.createOrder({ venue: mj, customer: g, channel: "collect", tableId: null, lines: [{ menuItemId: item.id, qty: 1 }], creditRequestedCents: 0, useDouble: false, idempotencyKey: "k-card-1", appUrl: "https://app.test" }, provider);
    await systemDb().update(t.orders).set({ provider: "mypos" }).where(eq(t.orders.id, order.id));
    const { rawBody, headers } = provider.simulatePayment(order.providerOrderId!);
    await svc.handleWebhook(provider, rawBody, headers);
    const after = await c.dayCardTakings(mj, new Date().toLocaleDateString("en-CA", { timeZone: mj.timezone }));
    expect(after.myposCents - before.myposCents).toBe(order.amountPaidCents);
  });
});
