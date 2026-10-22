import { describe, expect, it } from "vitest";
import {
  ageOn,
  assertCanAdvance,
  balances,
  buildStatement,
  CartError,
  convertPoints,
  creditToApply,
  levelFor,
  MockProvider,
  priceCart,
  reverseEntries,
  settleOrder,
  signSession,
  signWebhook,
  splitByStation,
  vatFromGross,
  verifyRevolutSignature,
  verifySession,
  normalisePhone,
  type Level,
  type PricedMenuItem,
  type ProgrammeRules,
} from "./index";

const item = (o: Partial<PricedMenuItem> & { id: string }): PricedMenuItem => ({
  name: o.id,
  priceCents: 600,
  vatRate: 23,
  station: "bar",
  containsAlcohol: false,
  availableForCollect: true,
  active: true,
  soldOut: false,
  ...o,
});

const menu = new Map(
  [
    item({ id: "guinness", priceCents: 610, containsAlcohol: true }),
    item({ id: "coffee", priceCents: 350, vatRate: 9 }),
    item({ id: "burger", priceCents: 1695, vatRate: 9, station: "kitchen", availableForCollect: false }),
    item({ id: "gone", soldOut: true }),
  ].map((i) => [i.id, i]),
);

describe("VAT", () => {
  it("extracts VAT from inclusive prices, rounding half-up", () => {
    expect(vatFromGross(610, 23)).toBe(114); // 610*23/123 = 114.06
    expect(vatFromGross(1695, 9)).toBe(140); // 139.95 → 140
    expect(vatFromGross(123, 23)).toBe(23);
    expect(vatFromGross(0, 9)).toBe(0);
  });
  it("rejects fractional cents", () => {
    expect(() => vatFromGross(1.5, 9)).toThrow();
  });
});

describe("priceCart", () => {
  it("prices from the menu and sums VAT per line", () => {
    const c = priceCart(menu, [{ menuItemId: "guinness", qty: 2 }, { menuItemId: "burger", qty: 1 }, { menuItemId: "guinness", qty: 1 }], "table");
    expect(c.grossCents).toBe(3 * 610 + 1695);
    expect(c.vat23Cents).toBe(vatFromGross(1830, 23));
    expect(c.vat9Cents).toBe(vatFromGross(1695, 9));
    expect(c.lines).toHaveLength(2);
    expect(c.containsAlcohol).toBe(true);
    expect([...splitByStation(c.lines).keys()].sort()).toEqual(["bar", "kitchen"]);
  });
  it("refuses food for collection, sold-out, unknown and bad quantities", () => {
    expect(() => priceCart(menu, [{ menuItemId: "burger", qty: 1 }], "collect")).toThrow(CartError);
    expect(() => priceCart(menu, [{ menuItemId: "gone", qty: 1 }], "table")).toThrow(/sold out/);
    expect(() => priceCart(menu, [{ menuItemId: "nope", qty: 1 }], "table")).toThrow(CartError);
    expect(() => priceCart(menu, [{ menuItemId: "coffee", qty: 0 }], "table")).toThrow(CartError);
    expect(() => priceCart(menu, [{ menuItemId: "coffee", qty: 21 }], "table")).toThrow(CartError);
    expect(() => priceCart(menu, [], "table")).toThrow(CartError);
  });
});

describe("age", () => {
  it("counts birthdays correctly", () => {
    const today = new Date("2026-10-22T12:00:00Z");
    expect(ageOn("2008-10-22", today)).toBe(18);
    expect(ageOn("2008-10-23", today)).toBe(17);
  });
});

const rules: ProgrammeRules = { pointsPerEuro: 10, pointsPerCreditEuro: 100, signupCreditCents: 1000, referralPoints: 500 };
const levels: Level[] = [
  { name: "Local", minSpend12mCents: 40_000, levelupPoints: 500, doublePointsCount: 2, birthdayCreditCents: 1500 },
  { name: "Regular", minSpend12mCents: 0, levelupPoints: 0, doublePointsCount: 0, birthdayCreditCents: 1000 },
  { name: "Stalwart", minSpend12mCents: 150_000, levelupPoints: 1000, doublePointsCount: 4, birthdayCreditCents: 2500 },
];

describe("loyalty", () => {
  const base = { orderId: "o1", rules, levels, useDouble: false, creditUsedCents: 0, balancesBefore: { points: 0, creditCents: 0, doubles: 0 } };

  it("earns on the card-paid amount only", () => {
    const e = settleOrder({ ...base, spend12mBeforeCents: 0, amountPaidCents: 1299, creditUsedCents: 500, balancesBefore: { points: 0, creditCents: 1000, doubles: 0 } });
    expect(e).toContainEqual({ kind: "credit", delta: -500, reason: "redeem", orderId: "o1" });
    expect(e).toContainEqual({ kind: "points", delta: 129, reason: "earn", orderId: "o1" });
  });

  it("doubles points and uses one token", () => {
    const e = settleOrder({ ...base, spend12mBeforeCents: 0, amountPaidCents: 1000, useDouble: true, balancesBefore: { points: 0, creditCents: 0, doubles: 1 } });
    expect(balances(e)).toEqual({ points: 200, creditCents: 0, doubles: -1 });
  });

  it("ignores a double request with no tokens", () => {
    const e = settleOrder({ ...base, spend12mBeforeCents: 0, amountPaidCents: 1000, useDouble: true });
    expect(balances(e)).toEqual({ points: 100, creditCents: 0, doubles: 0 });
  });

  it("awards every level crossed", () => {
    const e = settleOrder({ ...base, spend12mBeforeCents: 39_000, amountPaidCents: 120_000 });
    expect(e.filter((x) => x.reason.startsWith("levelup"))).toHaveLength(4);
    expect(levelFor(levels, 159_000).name).toBe("Stalwart");
    expect(levelFor(levels, 39_999).name).toBe("Regular");
  });

  it("refuses to spend credit it doesn't have", () => {
    expect(() => settleOrder({ ...base, spend12mBeforeCents: 0, amountPaidCents: 0, creditUsedCents: 100 })).toThrow();
  });

  it("caps credit at balance and order total", () => {
    expect(creditToApply(5000, 1000, 800)).toBe(800);
    expect(creditToApply(5000, 300, 800)).toBe(300);
    expect(creditToApply(-1, 300, 800)).toBe(0);
  });

  it("reverses an order's entries", () => {
    const e = settleOrder({ ...base, spend12mBeforeCents: 0, amountPaidCents: 1000 });
    expect(balances([...e, ...reverseEntries(e, "o1")])).toEqual({ points: 0, creditCents: 0, doubles: 0 });
  });

  it("converts points to credit in whole euros", () => {
    expect(balances(convertPoints(rules, 500, 300))).toEqual({ points: -300, creditCents: 300, doubles: 0 });
    expect(() => convertPoints(rules, 500, 150)).toThrow();
    expect(() => convertPoints(rules, 100, 200)).toThrow();
  });
});

describe("billing", () => {
  it("charges 1% of net app payments plus subscription, with VAT on fees", () => {
    const s = buildStatement({ appGrossCents: 1_234_567, appRefundsCents: 34_567, appFeeBps: 100, subscriptionCents: 9900 });
    expect(s.netAppCents).toBe(1_200_000);
    expect(s.appFeeCents).toBe(12_000);
    expect(s.feesExVatCents).toBe(21_900);
    expect(s.vatCents).toBe(5037);
    expect(s.totalCents).toBe(26_937);
  });
});

describe("dockets", () => {
  it("blocks collection until ID is checked", () => {
    expect(() => assertCanAdvance({ status: "ready", idCheckRequired: true, idCheckedAt: null }, "done")).toThrow(/Check ID/);
    expect(() => assertCanAdvance({ status: "ready", idCheckRequired: true, idCheckedAt: new Date() }, "done")).not.toThrow();
    expect(() => assertCanAdvance({ status: "new", idCheckRequired: false, idCheckedAt: null }, "done")).toThrow();
  });
});

describe("webhook signatures", () => {
  const body = '{"event":"ORDER_COMPLETED","order_id":"x"}';
  const now = 1_800_000_000_000;
  const ts = String(now);
  it("accepts a valid signature, including during key rotation", () => {
    const sig = signWebhook(body, ts, "s3cret");
    expect(verifyRevolutSignature(body, ts, sig, "s3cret", now)).toBe(true);
    expect(verifyRevolutSignature(body, ts, `v1=deadbeef,${sig}`, "s3cret", now)).toBe(true);
  });
  it("rejects tampering, wrong secrets and stale timestamps", () => {
    const sig = signWebhook(body, ts, "s3cret");
    expect(verifyRevolutSignature(body + " ", ts, sig, "s3cret", now)).toBe(false);
    expect(verifyRevolutSignature(body, ts, sig, "other", now)).toBe(false);
    expect(verifyRevolutSignature(body, ts, sig, "s3cret", now + 6 * 60_000)).toBe(false);
    expect(verifyRevolutSignature(body, null, sig, "s3cret", now)).toBe(false);
  });
  it("mock provider sends webhooks that verify", async () => {
    const p = new MockProvider();
    const o = await p.createOrder({ amountCents: 100, currency: "EUR", reference: "r", description: "d", lineItems: [] });
    const { rawBody, headers } = p.simulatePayment(o.providerOrderId);
    expect(p.verifyWebhook(rawBody, headers)).toBe(true);
    expect(p.parseWebhook(rawBody)).toEqual({ event: "ORDER_COMPLETED", providerOrderId: o.providerOrderId });
    expect((await p.getOrder(o.providerOrderId)).state).toBe("completed");
  });
});

describe("sessions", () => {
  it("round-trips and rejects tampering, wrong kind and expiry", () => {
    const v = signSession("guest", "abc", "k", 1000, 0);
    expect(verifySession(v, "guest", "k", 500)).toBe("abc");
    expect(verifySession(v, "staff", "k", 500)).toBeNull();
    expect(verifySession(v, "guest", "k", 2000)).toBeNull();
    expect(verifySession(v.replace("abc", "abd"), "guest", "k", 500)).toBeNull();
  });
  it("normalises Irish phone numbers", () => {
    expect(normalisePhone("087 123 4567")).toBe("+353871234567");
    expect(normalisePhone("+353 87 123 4567")).toBe("+353871234567");
    expect(normalisePhone("hello")).toBeNull();
  });
});
