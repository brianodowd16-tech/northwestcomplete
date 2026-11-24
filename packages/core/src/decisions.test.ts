import { describe, expect, it } from "vitest";
import { benefitsFor, checkEligibility, DEFAULT_REDEMPTION_RULES, nextBestActions, normaliseRules, recommendItems, resolveRedemption, type AgentLimits, type MemberState } from "./index";

const level = { name: "Regular", minSpend12mCents: 0, levelupPoints: 0, doublePointsCount: 0, birthdayCreditCents: 1500 };
const next = { name: "Local", minSpend12mCents: 40_000, levelupPoints: 1500, doublePointsCount: 2, birthdayCreditCents: 2500 };
const m: MemberState = {
  balances: { points: 340, creditCents: 1000, doubles: 1 },
  spend12mCents: 37_000,
  level,
  next,
  programme: { pointsPerEuro: 10, pointsPerCreditEuro: 100, signupCreditCents: 1000, referralPoints: 500 },
};
const strict = normaliseRules({ creditMinOrderCents: 1500, allowCreditWithDouble: false, monthlyCreditBudgetCents: 50_000, doubleMinOrderCents: 2000 });
const agent: AgentLimits = { scopes: ["benefits:read", "orders:quote"], maxOrderCents: 5000, maxCreditCents: 500 };

describe("benefits", () => {
  it("lists what the member holds as data, with conditions and reasons", () => {
    const b = benefitsFor(m, strict, 10_000);
    expect(b.map((x) => [x.id, x.available])).toEqual([
      ["credit", true],
      ["double_points", true],
      ["convert_points", true],
      ["birthday_credit", false],
      ["next_level", false],
    ]);
    expect(b[0].conditions).toEqual(["Orders of €15.00 or more", "Can't be combined with double points"]);
    expect(b[2].valueCents).toBe(300);
    expect(benefitsFor(m, strict, 0)[0]).toMatchObject({ available: false, reason: expect.stringMatching(/allowance/) });
  });
});

describe("eligibility", () => {
  it("applies venue rules", () => {
    expect(checkEligibility({ type: "apply_credit", amountCents: 500, orderGrossCents: 1000, withDouble: false }, m, strict, null).reasons).toEqual(["Credit needs an order of €15.00 or more"]);
    expect(checkEligibility({ type: "apply_credit", amountCents: 500, orderGrossCents: 2000, withDouble: true }, m, strict, null).allowed).toBe(false);
    expect(checkEligibility({ type: "apply_credit", amountCents: 500, orderGrossCents: 2000, withDouble: false }, m, strict, 400).reasons).toContain("The venue's credit allowance for this month is used up");
    expect(checkEligibility({ type: "convert_points", points: 150 }, m, strict, null).reasons).toEqual(["Convert in blocks of 100 points"]);
    expect(checkEligibility({ type: "convert_points", points: 300 }, m, strict, null).allowed).toBe(true);
  });
  it("holds an AI agent to the guest's scopes and limits", () => {
    expect(checkEligibility({ type: "convert_points", points: 300 }, m, strict, null, agent).reasons).toEqual(["You haven't allowed this assistant to do that"]);
    expect(checkEligibility({ type: "apply_credit", amountCents: 800, orderGrossCents: 3000, withDouble: false }, m, strict, null, agent).reasons).toEqual(["Above the €5.00 credit limit you set for this assistant"]);
    expect(checkEligibility({ type: "quote_order", orderGrossCents: 6000 }, m, strict, null, agent).allowed).toBe(false);
    expect(checkEligibility({ type: "create_order", orderGrossCents: 2000, creditCents: 0 }, m, strict, null, agent).reasons).toEqual(["You haven't allowed this assistant to do that"]);
  });
});

describe("resolving a checkout", () => {
  it("enforces minimums, budgets and stacking on the server", () => {
    expect(resolveRedemption({ wantCredit: true, wantDouble: true }, 1000, m, strict, null)).toEqual({ creditCents: 0, useDouble: false });
    expect(resolveRedemption({ wantCredit: true, wantDouble: true }, 2500, m, strict, null)).toEqual({ creditCents: 1000, useDouble: false });
    expect(resolveRedemption({ wantCredit: true, wantDouble: true }, 2500, m, strict, 300)).toEqual({ creditCents: 300, useDouble: false });
    expect(resolveRedemption({ wantCredit: false, wantDouble: true }, 2500, m, strict, null)).toEqual({ creditCents: 0, useDouble: true });
    expect(resolveRedemption({ wantCredit: true, wantDouble: true }, 2500, m, DEFAULT_REDEMPTION_RULES, null)).toEqual({ creditCents: 1000, useDouble: true });
  });
});

describe("next best action", () => {
  it("ranks useful actions and nudges a level-up that's close", () => {
    const s = nextBestActions(m, DEFAULT_REDEMPTION_RULES, 2500, null);
    expect(s.map((x) => x.kind)).toEqual(["use_credit", "use_double", "level_up", "convert_points"]);
    expect(nextBestActions(null, DEFAULT_REDEMPTION_RULES, 0, null)[0].kind).toBe("join");
  });
});

describe("recommendations", () => {
  it("prefers the guest's usual, then pairings, then popular; skips basket and sold-out items", () => {
    const r = recommendItems({
      available: new Set(["stout", "fish", "chowder", "soft", "gt"]),
      basket: new Set(["fish"]),
      history: [{ itemId: "stout", qty: 3 }, { itemId: "gt", qty: 1 }],
      pairs: [{ a: "fish", b: "soft", count: 4 }, { a: "fish", b: "lager", count: 9 }],
      popular: [{ itemId: "chowder", qty: 10 }, { itemId: "stout", qty: 8 }],
    });
    expect(r).toEqual([
      { itemId: "stout", reason: "your_usual" },
      { itemId: "soft", reason: "goes_with", withItemId: "fish" },
      { itemId: "chowder", reason: "popular" },
    ]);
  });
});
