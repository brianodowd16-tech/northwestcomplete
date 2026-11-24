import { describe, expect, it } from "vitest";
import { checkTip, cleanAllergens, discountLines, stationOpen, tipFor } from "./service";

const TZ = "Europe/Dublin";
const week = (span: [string, string] | null) => Array.from({ length: 7 }, () => span);

describe("opening hours and pause", () => {
  it("closes the kitchen outside its hours and keeps late bars open past midnight", () => {
    const hours = { kitchen: week(["12:00", "21:00"]), bar: week(["12:00", "01:30"]) };
    const wed10pm = new Date("2026-11-25T22:00:00Z"), thu1am = new Date("2026-11-26T01:00:00Z"), thu2am = new Date("2026-11-26T02:00:00Z");
    expect(stationOpen(hours, null, "kitchen", wed10pm, TZ)).toMatchObject({ open: false, reason: expect.stringMatching(/12:00–21:00/) });
    expect(stationOpen(hours, null, "bar", wed10pm, TZ).open).toBe(true);
    expect(stationOpen(hours, null, "bar", thu1am, TZ).open).toBe(true);
    expect(stationOpen(hours, null, "bar", thu2am, TZ).open).toBe(false);
    expect(stationOpen(null, null, "kitchen", thu2am, TZ).open).toBe(true);
  });
  it("respects a pause", () => {
    const at = new Date("2026-11-25T19:00:00Z");
    expect(stationOpen(null, { kitchen: "2026-11-25T19:30:00Z" }, "kitchen", at, TZ)).toMatchObject({ open: false, reason: expect.stringMatching(/19:30/) });
    expect(stationOpen(null, { kitchen: "2026-11-25T18:30:00Z" }, "kitchen", at, TZ).open).toBe(true);
  });
});

describe("tips, discounts, allergens", () => {
  it("works out tips and refuses silly ones", () => {
    expect(tipFor(4550, 12.5)).toBe(569);
    expect(tipFor(4550, 0)).toBe(0);
    expect(() => checkTip(9000, 1000)).toThrow(/too big/);
    expect(() => checkTip(500, 1000)).not.toThrow();
  });
  it("spreads a discount exactly and recalculates VAT per line", () => {
    const r = discountLines([{ grossCents: 1700, vatRate: 9 as const }, { grossCents: 620, vatRate: 23 as const }, { grossCents: 620, vatRate: 23 as const }], 294);
    expect(r.reduce((s, l) => s + l.grossCents, 0)).toBe(2940 - 294);
    expect(r[0]).toMatchObject({ grossCents: 1530, vatCents: 126 });
    expect(() => discountLines([{ grossCents: 100, vatRate: 23 as const }], 101)).toThrow();
  });
  it("keeps only known allergens", () => {
    expect(cleanAllergens(["milk", "gluten", "unicorn", "milk"])).toEqual(["milk", "gluten"]);
  });
});
