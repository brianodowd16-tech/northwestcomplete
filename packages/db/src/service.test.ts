import { MockProvider } from "@round/core";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as admin from "./admin";
import { pool, systemDb } from "./index";
import * as inv from "./inventory";
import * as privacy from "./privacy";
import * as t from "./schema";
import { seed } from "./seed";
import * as svc from "./services";
import { resetDatabase } from "./setup";
import * as till from "./till";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://round:round@localhost:5432/round_test";
const provider = new MockProvider();
let mj: svc.Venue, staff: svc.Staff, guest: svc.Customer, ids: Record<string, string>;
const reload = async () => (mj = await svc.venueBySlug("mj-oconnors"));
const order = (lines: { menuItemId: string; qty: number; note?: string }[], key: string, tipCents = 0) =>
  svc.createOrder({ venue: mj, customer: guest, channel: "collect", tableId: null, lines, creditRequestedCents: 0, useDouble: false, idempotencyKey: key, appUrl: "https://x", tipCents }, provider);

beforeAll(async () => {
  await seed(await resetDatabase());
  await reload();
  staff = (await svc.staffByEmail("staff@mjoconnors.example"))!;
  guest = await svc.createCustomer({ phone: "+353870005001", name: "Niamh Kelly", email: "n@example.com", dateOfBirth: "1990-01-01", marketingConsent: true });
  ids = Object.fromEntries((await svc.menu(mj)).flatMap((c) => c.items).map((i) => [i.name, i.id]));
});
afterAll(() => pool().end());

describe("allergens, hours and pause", () => {
  it("declares allergens on items", async () => {
    const fish = (await svc.menu(mj)).flatMap((c) => c.items).find((i) => i.name === "Fish & chips")!;
    expect(fish.allergens).toEqual(["fish", "gluten"]);
  });
  it("refuses orders when a station is closed or paused, and takes them again after", async () => {
    await admin.saveHours(mj, { bar: Array(7).fill(null), kitchen: Array(7).fill(null) });
    await reload();
    await expect(order([{ menuItemId: ids["Pint of stout"], qty: 1 }], "h1")).rejects.toThrow(/bar is closed/);
    await admin.saveHours(mj, null);
    await admin.pauseStation(staff, "bar", 15);
    await reload();
    await expect(order([{ menuItemId: ids["Pint of stout"], qty: 1 }], "h2")).rejects.toThrow(/paused/);
    await admin.pauseStation(staff, "bar", 0);
    await reload();
    expect((await order([{ menuItemId: ids["Pint of stout"], qty: 1 }], "h3")).order.status).toBe("pending_payment");
    await expect(admin.saveHours(mj, { bar: [["25:00", "02:00"], null, null, null, null, null, null] })).rejects.toThrow(/times like/);
  });
});

describe("tips and notes", () => {
  it("adds the tip to the payment but not to points or the app fee, and keeps notes", async () => {
    const { order: o } = await order([{ menuItemId: ids["Pint of stout"], qty: 2, note: "no head please" }], "t1", 150);
    expect(o).toMatchObject({ amountPaidCents: 1240 + 150, tipCents: 150 });
    const { rawBody, headers } = provider.simulatePayment(o.providerOrderId!);
    await svc.handleWebhook(provider, rawBody, headers, mj);
    const view = await svc.orderForCustomer(mj, o.id, guest.id);
    expect(view.pointsEarned).toBe(124); // €12.40 × 10 points, not €13.90 with the tip
    const bar = await svc.stationDockets(staff, "bar");
    expect(bar.find((d) => d.orderId === o.id)!.lines[0].note).toBe("no head please");
    await systemDb().update(t.orders).set({ provider: "mypos" }).where(eq(t.orders.id, o.id));
    const now = new Date();
    expect((await svc.billingStatement(mj, now.getUTCFullYear(), now.getUTCMonth() + 1)).appGrossCents).toBe(1240);
    await expect(order([{ menuItemId: ids["Soft drink"], qty: 1 }], "t2", 5000)).rejects.toThrow(/too big/);
  });
});

describe("till: discounts, tabs, cash-up", () => {
  it("applies a discount with VAT recalculated, and limits staff discounts", async () => {
    const r = await till.ringUpSale(mj, staff, { key: "disc-00001", lines: [{ menuItemId: ids["Pint of stout"], qty: 2 }], method: "cash", discountCents: 124, discountReason: "Regular" });
    expect(r.order).toMatchObject({ grossCents: 1116, discountCents: 124, vat23Cents: 209 });
    await expect(till.ringUpSale(mj, staff, { key: "disc-00002", lines: [{ menuItemId: ids["Pint of stout"], qty: 1 }], method: "cash", discountCents: 100 })).rejects.toThrow(/reason/);
    const bar = { ...staff, role: "staff" as const };
    await expect(till.ringUpSale(mj, bar, { key: "disc-00003", lines: [{ menuItemId: ids["Pint of stout"], qty: 1 }], method: "cash", discountCents: 620, discountReason: "Manager comp" })).rejects.toThrow(/manager/);
  });
  it("runs a tab: rounds go out (stock, dockets) and are paid together", async () => {
    const keg = async () => (await inv.stockLevels(mj)).items.find((i) => i.name === "Stout keg")!.onHand;
    const before = await keg();
    const a = await till.ringUpSale(mj, staff, { key: "tab-000001", lines: [{ menuItemId: ids["Pint of stout"], qty: 3 }], method: "tab", tabName: "Seán" });
    expect(a.order.status).toBe("open");
    const tabId = a.order.tabId!;
    await till.ringUpSale(mj, staff, { key: "tab-000002", lines: [{ menuItemId: ids["Pint of lager"], qty: 1 }], method: "tab", tabId });
    const void1 = await till.ringUpSale(mj, staff, { key: "tab-000003", lines: [{ menuItemId: ids["Pint of stout"], qty: 1 }], method: "tab", tabId });
    await till.refundTillSale(mj, staff, void1.order.id); // rung by mistake: voided, stock back
    expect(await keg()).toBe(before - 3 * 568);
    const [tb] = await till.openTabs(mj);
    expect(tb).toMatchObject({ name: "Seán", totalCents: 3 * 620 + 640, rounds: 2 });
    const closed = await till.closeTab(mj, staff, tabId, { method: "cash", tenderedCents: 3000 });
    expect(closed).toMatchObject({ totalCents: 2500, changeCents: 500 });
    expect(await till.openTabs(mj)).toHaveLength(0);
    await expect(till.closeTab(mj, staff, tabId, { method: "cash" })).rejects.toThrow(/already closed/);
  });
  it("cashes up against the drawer", async () => {
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Dublin" }).format(new Date());
    const z = await till.dayReport(mj, date);
    const up = await till.recordCashUp(mj, staff, date, { floatCents: 15_000, countedCents: 15_000 + z.till.cashCents - 500 });
    expect(up.varianceCents).toBe(-500);
  });
});

describe("GDPR", () => {
  it("exports the guest's data and deletes the account but keeps anonymous sales", async () => {
    const data = await privacy.exportGuestData(guest.id);
    expect(data!.profile).toMatchObject({ name: "Niamh Kelly", phone: "+353870005001" });
    expect(data!.orders.length).toBeGreaterThan(0);
    await privacy.deleteGuest(guest.id);
    const after = await svc.customerById(guest.id);
    expect(after).toMatchObject({ name: "Deleted guest", email: "", marketingConsent: false });
    expect(after!.deletedAt).not.toBeNull();
    expect(await svc.customerByPhone("+353870005001")).toBeNull();
    const orders = await systemDb().select().from(t.orders).where(eq(t.orders.customerId, guest.id));
    expect(orders.length).toBeGreaterThan(0);
  });
});
