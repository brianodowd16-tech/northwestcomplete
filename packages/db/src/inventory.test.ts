import { MockProvider } from "@round/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "./index";
import * as inv from "./inventory";
import { seed } from "./seed";
import * as svc from "./services";
import { resetDatabase } from "./setup";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://round:round@localhost:5432/round_test";
const provider = new MockProvider();
let mj: svc.Venue, staff: svc.Staff, guest: svc.Customer;
let menu: Record<string, string>;
let keg: string, gin: string, tonic: string;
const onHand = async (id: string) => (await inv.stockLevels(mj)).items.find((i) => i.id === id)!.onHand;

beforeAll(async () => {
  await seed(await resetDatabase(), { stock: false });
  mj = await svc.venueBySlug("mj-oconnors");
  staff = (await svc.staffByEmail("staff@mjoconnors.example"))!;
  guest = await svc.createCustomer({ phone: "+353870003001", name: "Ciara Walsh", email: "c@example.com", dateOfBirth: "1990-01-01", marketingConsent: false });
  menu = Object.fromEntries((await svc.menu(mj)).flatMap((c) => c.items).map((i) => [i.name, i.id]));
});
afterAll(() => pool().end());

async function paid(names: string[], key: string) {
  const { order } = await svc.createOrder(
    { venue: mj, customer: guest, channel: "collect", tableId: null, lines: names.map((n) => ({ menuItemId: menu[n], qty: 1 })), creditRequestedCents: 0, useDouble: false, idempotencyKey: key, appUrl: "https://x" },
    provider,
  );
  const { rawBody, headers } = provider.simulatePayment(order.providerOrderId!);
  await svc.handleWebhook(provider, rawBody, headers, mj);
  return order;
}

describe("inventory", () => {
  it("sets up suppliers, stock items and recipes with costs", async () => {
    const sup = await inv.saveSupplier(mj, { name: "Drinks Co", email: "orders@drinks.example" });
    keg = (await inv.saveStockItem(mj, { name: "Stout keg", unit: "ml", supplierId: sup.id, packSize: 50_000, packName: "keg", packCostCents: 18_000, parLevel: 60_000 })).id;
    gin = (await inv.saveStockItem(mj, { name: "Gin", unit: "ml", supplierId: sup.id, packSize: 700, packName: "bottle", packCostCents: 2400, parLevel: 0 })).id;
    tonic = (await inv.saveStockItem(mj, { name: "Tonic", unit: "each", supplierId: sup.id, packSize: 24, packName: "case", packCostCents: 1440, parLevel: 0 })).id;
    await expect(inv.saveStockItem(mj, { name: "Gin", unit: "ml", packSize: 700, packCostCents: 1, parLevel: 0 })).rejects.toThrow(/already/);
    await inv.setRecipe(mj, menu["Pint of stout"], [{ stockItemId: keg, qty: 568 }]);
    await inv.setRecipe(mj, menu["Gin & tonic"], [
      { stockItemId: gin, qty: 35 },
      { stockItemId: tonic, qty: 1 },
    ]);
    const r = await inv.recipes(mj);
    expect(r.find((x) => x.menuItem.name === "Gin & tonic")).toMatchObject({ costCents: 180, gpCents: 592 });
    // another venue's stock can't be used
    const drum = await svc.venueBySlug("drumhierny");
    await expect(inv.setRecipe(drum, menu["Pint of stout"], [])).rejects.toThrow(/not found/);
  });

  it("adds deliveries and takes paid orders out of stock", async () => {
    await inv.recordDelivery(mj, staff, { lines: [{ stockItemId: keg, packs: 2, packCostCents: 18_000 }, { stockItemId: gin, packs: 1, packCostCents: 2400 }] });
    expect(await onHand(keg)).toBe(100_000);
    await paid(["Pint of stout", "Pint of stout"], "inv1");
    expect(await onHand(keg)).toBe(100_000 - 1136);
  });

  it("puts stock back when an order is refused at the bar", async () => {
    const o = await paid(["Pint of stout"], "inv2");
    expect(await onHand(keg)).toBe(100_000 - 1704);
    const { dockets } = await svc.orderForCustomer(mj, o.id, guest.id);
    await svc.refuseId(staff, dockets[0].id, provider);
    expect(await onHand(keg)).toBe(100_000 - 1136);
  });

  it("records waste by menu item and counts with the variance", async () => {
    await inv.recordWaste(mj, staff, { menuItemId: menu["Pint of stout"], servings: 1, reason: "Spillage" });
    expect(await onHand(keg)).toBe(100_000 - 1704);
    await expect(inv.recordWaste(mj, staff, { menuItemId: menu["Soft drink"], servings: 1, reason: "Spillage" })).rejects.toThrow(/no recipe/);
    const count = await inv.recordCount(mj, staff, [{ stockItemId: keg, counted: 97_000 }]);
    expect(count.lines[0]).toMatchObject({ expected: 98_296, counted: 97_000 });
    expect(count.varianceCents).toBe(-467); // 1.296 L unexplained at €3.60/L
    expect(await onHand(keg)).toBe(97_000);
    const w = await inv.wasteReport(mj, new Date(Date.now() - 3600_000), new Date(Date.now() + 3600_000));
    expect(w.byReason).toEqual([["Spillage", 204]]);
  });

  it("marks items sold out when an ingredient runs out, and back on after a delivery", async () => {
    await inv.setAutoSoldOut(await svc.venueBySlug("mj-oconnors"), true);
    mj = await svc.venueBySlug("mj-oconnors");
    const gt = async () => (await svc.menu(mj)).flatMap((c) => c.items).find((i) => i.name === "Gin & tonic")!;
    expect((await gt()).soldOut).toBe(true); // no tonic in stock
    await inv.recordDelivery(mj, staff, { lines: [{ stockItemId: tonic, packs: 1, packCostCents: 1440 }] });
    expect((await gt()).soldOut).toBe(false);
  });

  it("imports till sales once per day", async () => {
    const before = await onHand(keg);
    const r = await inv.importTillSales(mj, staff, "2026-11-20", [
      { name: "pint of stout", qty: 10 },
      { name: "Toastie", qty: 2 },
    ]);
    expect(r).toMatchObject({ matched: 1, unmatched: ["Toastie"], replaced: false });
    expect(await onHand(keg)).toBe(before - 5680);
    expect((await inv.importTillSales(mj, staff, "2026-11-20", [{ name: "Pint of stout", qty: 10 }])).replaced).toBe(true);
    expect(await onHand(keg)).toBe(before - 5680);
  });

  it("suggests and receives supplier orders", async () => {
    await inv.saveStockItem(mj, { id: keg, name: "Stout keg", unit: "ml", supplierId: (await inv.stockLevels(mj)).suppliers[0].id, packSize: 50_000, packName: "keg", packCostCents: 18_000, parLevel: 150_000 });
    const [s] = await inv.suggestedOrders(mj);
    expect(s.lines[0]).toMatchObject({ packs: 2 });
    const po = await inv.createPurchaseOrder(mj, s.supplier.id, s.lines.map((l) => ({ stockItemId: l.item.id, packs: l.packs })));
    expect(po.totalCents).toBe(36_000);
    const before = await onHand(keg);
    await inv.receivePurchaseOrder(mj, staff, po.id);
    expect(await onHand(keg)).toBe(before + 100_000);
    await expect(inv.receivePurchaseOrder(mj, staff, po.id)).rejects.toThrow(/can't be received/);
  });

  it("reports profit by item with menu engineering", async () => {
    const r = await inv.profitReport(mj, new Date("2026-11-01T00:00:00Z"), new Date(Date.now() + 86_400_000));
    const stout = r.items.find((i) => i.name === "Pint of stout")!;
    expect(stout).toMatchObject({ appQty: 2, tillQty: 10, qty: 12, unitCostCents: 204 });
    expect(stout.class).toBeDefined();
    expect(r.totals.wasteCents).toBe(204);
    expect(r.totals.varianceCents).toBe(-467);
  });
});
