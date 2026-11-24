import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "./index";
import * as inv from "./inventory";
import { seed } from "./seed";
import * as svc from "./services";
import { resetDatabase } from "./setup";
import * as till from "./till";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://round:round@localhost:5432/round_test";
let mj: svc.Venue, staff: svc.Staff, ids: Record<string, string>;
const keg = async () => (await inv.stockLevels(mj)).items.find((i) => i.name === "Stout keg")!.onHand;

beforeAll(async () => {
  await seed(await resetDatabase());
  mj = await svc.venueBySlug("mj-oconnors");
  staff = (await svc.staffByEmail("staff@mjoconnors.example"))!;
  ids = Object.fromEntries((await svc.menu(mj)).flatMap((c) => c.items).map((i) => [i.name, i.id]));
});
afterAll(() => pool().end());

describe("till", () => {
  it("rings up a cash sale: priced on the server, change given, stock taken out, no docket for drinks", async () => {
    const before = await keg();
    const r = await till.ringUpSale(mj, staff, { key: "sale-0001", lines: [{ menuItemId: ids["Pint of stout"], qty: 2 }], method: "cash", tenderedCents: 2000 });
    expect(r.order).toMatchObject({ channel: "counter", status: "paid", amountPaidCents: 1240, provider: "cash", customerId: null });
    expect(r.changeCents).toBe(760);
    expect(await keg()).toBe(before - 1136);
    const again = await till.ringUpSale(mj, staff, { key: "sale-0001", lines: [{ menuItemId: ids["Pint of stout"], qty: 2 }], method: "cash", tenderedCents: 2000 });
    expect(again.repeat).toBe(true); // a double tap doesn't charge twice
    await expect(till.ringUpSale(mj, staff, { key: "sale-0002", lines: [{ menuItemId: ids["Pint of stout"], qty: 1 }], method: "cash", tenderedCents: 100 })).rejects.toThrow(/Not enough cash/);
  });

  it("sends food to the kitchen for a table, and needs the table number", async () => {
    await expect(till.ringUpSale(mj, staff, { key: "sale-0003", lines: [{ menuItemId: ids["Fish & chips"], qty: 1 }], method: "card" })).rejects.toThrow(/table number/);
    const r = await till.ringUpSale(mj, staff, { key: "sale-0004", lines: [{ menuItemId: ids["Fish & chips"], qty: 1 }, { menuItemId: ids["Pint of lager"], qty: 1 }], method: "card", tableNumber: 7, cardRef: "AUTH123" });
    expect(r.order).toMatchObject({ provider: "mypos_terminal", tableNumber: 7, providerTxnRef: "AUTH123" });
    const kitchen = await svc.stationDockets(staff, "kitchen");
    expect(kitchen.some((d) => d.orderId === r.order.id)).toBe(true);
    expect((await svc.stationDockets(staff, "bar")).some((d) => d.orderId === r.order.id)).toBe(false);
  });

  it("refunds a sale and puts the stock back, and keeps till sales out of the app fee", async () => {
    const before = await keg();
    const r = await till.ringUpSale(mj, staff, { key: "sale-0005", lines: [{ menuItemId: ids["Pint of stout"], qty: 1 }], method: "card" });
    await till.refundTillSale(mj, staff, r.order.id);
    expect(await keg()).toBe(before);
    await expect(till.refundTillSale(mj, staff, r.order.id)).rejects.toThrow(/can't be refunded/);
    const now = new Date();
    expect((await svc.billingStatement(mj, now.getUTCFullYear(), now.getUTCMonth() + 1)).appGrossCents).toBe(0);
  });

  it("adds up the day", async () => {
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Dublin" }).format(new Date());
    const z = await till.dayReport(mj, date);
    expect(z.till).toMatchObject({ sales: 2, cashCents: 1240, cardCents: 1700 + 640, refunds: 1, refundedCents: 620 });
    expect(z.byStaff[0]).toMatchObject({ sales: 2 });
    expect(z.topItems[0]).toMatchObject({ name: "Pint of stout", qty: 2 });
  });
});
