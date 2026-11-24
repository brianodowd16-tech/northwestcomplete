import { describe, expect, it } from "vitest";
import { forecast, fundingEstimate, payroll, priceSuggestions, seatsLeft, signBody, staffNeeded, verifySignature } from "./ops";

describe("forecast and rota", () => {
  it("averages the same weekday-hour and lifts for big games", () => {
    const fri8pm = (weeksAgo: number) => new Date(Date.UTC(2026, 10, 20 - weeksAgo * 7, 20, 10));
    const history = [0, 1, 2, 3].flatMap((w) => Array.from({ length: 20 }, () => ({ at: fri8pm(w), cents: 1000 })));
    const f = forecast(history, { from: new Date(Date.UTC(2026, 10, 27, 0)), days: 1, weeks: 4, tz: "Europe/Dublin", events: [{ start: new Date(Date.UTC(2026, 10, 27, 20)), end: new Date(Date.UTC(2026, 10, 27, 22)), lift: 1.5 }] });
    const h = f.find((x) => x.at.getUTCHours() === 20)!;
    expect(h).toMatchObject({ orders: 30, cents: 30_000, lift: 1.5 });
    expect(staffNeeded(h.orders)).toBe(2);
    expect(staffNeeded(0)).toBe(1);
  });
});

describe("price suggestions", () => {
  it("suggests a small capped rise for popular low-margin items", () => {
    const s = priceSuggestions([
      { id: "a", name: "Lager", priceCents: 640, gpPct: 60, class: "plowhorse", hasRecipe: true },
      { id: "b", name: "Wine", priceCents: 800, gpPct: 50, class: "dog", hasRecipe: true },
      { id: "c", name: "Stout", priceCents: 620, gpPct: 72, class: "star", hasRecipe: true },
    ]);
    expect(s[0]).toMatchObject({ kind: "raise", fromCents: 640, toCents: 690 });
    expect(s[1].kind).toBe("review");
    expect(s).toHaveLength(2);
  });
});

describe("payroll and funding", () => {
  it("rounds hours to the quarter and works out pay", () => {
    const r = payroll([{ staffId: "1", name: "Seán", email: "s@x", clockIn: new Date("2026-11-20T17:00:00Z"), clockOut: new Date("2026-11-21T01:07:00Z"), hourlyRateCents: 1400 }], new Date());
    expect(r[0]).toMatchObject({ hours: 8, grossCents: 11_200 });
  });
  it("estimates an advance from card sales", () => {
    expect(fundingEstimate(9_000_000)).toMatchObject({ eligible: true, monthlyCardCents: 3_000_000, advanceCents: 3_000_000 });
    expect(fundingEstimate(600_000).eligible).toBe(false);
  });
});

describe("webhooks and bookings", () => {
  it("checks signatures", () => {
    const body = '{"a":1}';
    expect(verifySignature(body, "s3cret", signBody(body, "s3cret"))).toBe(true);
    expect(verifySignature(body, "s3cret", "sha256=" + signBody(body, "other"))).toBe(false);
    expect(verifySignature(body, "s3cret", null)).toBe(false);
  });
  it("counts seats taken in a slot", () => {
    const at = new Date("2026-11-28T20:00:00Z");
    expect(seatsLeft(40, [{ partySize: 6, startsAt: new Date("2026-11-28T19:00:00Z"), status: "confirmed" }, { partySize: 4, startsAt: at, status: "cancelled" }], at)).toBe(34);
  });
});
