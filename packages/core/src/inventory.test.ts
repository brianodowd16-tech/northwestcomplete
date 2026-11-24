import { describe, expect, it } from "vitest";
import { formatQty, grossProfit, menuEngineering, packsToOrder, parseCountQty, parseTillCsv, readyNotice, recipeCost, valueAtCost } from "./inventory";

describe("stock costs", () => {
  it("values stock at the pack price", () => {
    expect(valueAtCost(568, 50_000, 18_000)).toBe(204); // a pint from a €180 50 L keg = €2.04
    expect(valueAtCost(-568, 50_000, 18_000)).toBe(-204);
    expect(valueAtCost(10, 0, 100)).toBe(0);
  });
  it("costs a recipe and its gross profit", () => {
    const gt = recipeCost([
      { qty: 35, packSize: 700, packCostCents: 2400 }, // gin: 35 ml of a €24 bottle = €1.20
      { qty: 1, packSize: 24, packCostCents: 1440 }, // tonic: 1 of 24 for €14.40 = €0.60
    ]);
    expect(gt).toBe(180);
    expect(grossProfit(950, 23, gt)).toEqual({ netCents: 772, costCents: 180, gpCents: 592, gpPct: 76.7 });
  });
});

describe("menu engineering", () => {
  it("sorts items into the four groups", () => {
    const r = menuEngineering([
      { id: "stout", qty: 100, gpCents: 300 },
      { id: "lager", qty: 90, gpCents: 150 },
      { id: "gin", qty: 10, gpCents: 600 },
      { id: "wine", qty: 5, gpCents: 100 },
    ]);
    expect(Object.fromEntries(r.map((x) => [x.id, x.class]))).toEqual({ stout: "star", lager: "plowhorse", gin: "puzzle", wine: "dog" });
  });
});

describe("ordering and counting", () => {
  it("suggests whole packs to get back above par", () => {
    expect(packsToOrder(20_000, 100_000, 50_000)).toBe(2);
    expect(packsToOrder(100_000, 100_000, 50_000)).toBe(0);
    expect(packsToOrder(5, 0, 1)).toBe(0);
  });
  it("reads counts in litres, kilos or items", () => {
    expect(parseCountQty("12,5", "ml")).toBe(12_500);
    expect(parseCountQty("3", "each")).toBe(3);
    expect(() => parseCountQty("lots", "g")).toThrow(/kg/);
    expect(formatQty(12_500, "ml")).toBe("12.5 L");
    expect(formatQty(330, "ml")).toBe("330 ml");
  });
});

describe("till import", () => {
  it("finds the columns, adds up repeats and skips totals", () => {
    const csv = '﻿Date;Item name;Quantity;Net sales\n2026-11-20;"Pint of stout";12;74,40\n2026-11-20;Soft drink;3;10,50\n2026-11-20;pint of stout;2;12,40\n;Total;17;97,30';
    expect(parseTillCsv(csv)).toEqual([
      { name: "Pint of stout", qty: 14 },
      { name: "Soft drink", qty: 3 },
    ]);
  });
  it("explains a file it can't read", () => {
    expect(() => parseTillCsv("a,b\n1,2")).toThrow(/item name and quantity/);
  });
});

describe("ready notifications", () => {
  it("tells the guest where to go", () => {
    expect(readyNotice("bar", 42, "MJ's", true).body).toMatch(/#42 is ready at the bar.*your ID/);
    expect(readyNotice("kitchen", 7, "MJ's", false).title).toBe("Your food is on its way");
  });
});
