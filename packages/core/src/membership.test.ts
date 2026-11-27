import { describe, expect, it } from "vitest";
import { checkPurchase, pointsForPurchase, tierEnds, tierPrice, walletSplit } from "./membership";

describe("membership tiers", () => {
  it("prices and periods", () => {
    expect(tierPrice("gold", "monthly")).toBe(499);
    expect(tierPrice("platinum", "annual")).toBe(12900);
    expect(tierEnds(new Date("2026-01-31T10:00:00Z"), "monthly").toISOString()).toBe("2026-03-03T10:00:00.000Z");
    expect(tierEnds(new Date("2026-11-27T10:00:00Z"), "annual").toISOString()).toBe("2027-11-27T10:00:00.000Z");
  });
  it("adds the tier's bonus to point purchases, only in set bundles", () => {
    expect(pointsForPurchase(5000, null)).toEqual({ paid: 5000, bonus: 0 });
    expect(pointsForPurchase(5000, "gold")).toEqual({ paid: 5000, bonus: 250 });
    expect(pointsForPurchase(2500, "platinum")).toEqual({ paid: 2500, bonus: 250 });
    expect(() => pointsForPurchase(1234, null)).toThrow(/€10, €25/);
  });
  it("keeps the wallet small", () => {
    expect(() => checkPurchase(10000, 45000, 0)).toThrow(/hold up to €500/);
    expect(() => checkPurchase(10000, 0, 20000)).toThrow(/€250 a month/);
    expect(() => checkPurchase(10000, 0, 15000)).not.toThrow();
  });
});

describe("paying with points (Irish alcohol rule)", () => {
  it("bonus points never pay for alcohol; bought points can", () => {
    // €20 bill: €12 food, €8 pints. 1,500 bonus + 1,000 bought points.
    expect(walletSplit({ dueCents: 2000, nonAlcoholDueCents: 1200, paidBalance: 1000, bonusBalance: 1500 })).toEqual({ bonusCents: 1200, paidCents: 800, totalCents: 2000, remainingCents: 0 });
    // All pints, only bonus points: nothing paid by points.
    expect(walletSplit({ dueCents: 1240, nonAlcoholDueCents: 0, paidBalance: 0, bonusBalance: 5000 })).toEqual({ bonusCents: 0, paidCents: 0, totalCents: 0, remainingCents: 1240 });
    // Not enough points: the rest goes on the card.
    expect(walletSplit({ dueCents: 3000, nonAlcoholDueCents: 3000, paidBalance: 500, bonusBalance: 300 })).toMatchObject({ totalCents: 800, remainingCents: 2200 });
  });
});
