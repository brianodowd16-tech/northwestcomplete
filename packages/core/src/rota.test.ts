import { describe, expect, it } from "vitest";
import { payrollCsv, payrollPeriod, rotaChecks, shareTips } from "./rota";

const TZ = "Europe/Dublin";
const sh = (staffId: string, start: string, end: string) => ({ staffId, name: staffId === "a" ? "Aoife Byrne" : "Seán Kelly", startsAt: new Date(start), endsAt: new Date(end) });

describe("rota checks", () => {
  it("flags short rest, long weeks, breaks and unavailable days", () => {
    const w = rotaChecks(
      [sh("a", "2026-11-23T17:00:00Z", "2026-11-24T01:00:00Z"), sh("a", "2026-11-24T10:00:00Z", "2026-11-24T16:00:00Z"), ...[25, 26, 27, 28, 29].map((d) => sh("b", `2026-11-${d}T10:00:00Z`, `2026-11-${d}T20:00:00Z`))],
      [{ staffId: "b", date: "2026-11-27" }],
      TZ,
    );
    const texts = w.map((x) => x.text).join(" | ");
    expect(texts).toMatch(/only 9\.0h rest/);
    expect(texts).toMatch(/30-minute break/);
    expect(texts).toMatch(/50\.0 hours this week/);
    expect(texts).toMatch(/2026-11-27: said they can't work/);
  });
});

describe("tips and payroll", () => {
  it("shares tips by hours and the cents add up", () => {
    const t = shareTips(1000, new Map([["a", 180], ["b", 360], ["c", 360]]));
    expect([...t.values()].reduce((a, b) => a + b, 0)).toBe(1000);
    expect(t.get("a")).toBe(200);
  });
  it("pays Sunday premium and shares tips", () => {
    const rows = payrollPeriod(
      [
        { staffId: "a", name: "Aoife Byrne", email: "a@x", payrollRef: "E1", clockIn: new Date("2026-11-22T12:00:00Z"), clockOut: new Date("2026-11-22T20:00:00Z"), hourlyRateCents: 1500 },
        { staffId: "a", name: "Aoife Byrne", email: "a@x", payrollRef: "E1", clockIn: new Date("2026-11-23T12:00:00Z"), clockOut: new Date("2026-11-23T16:00:00Z"), hourlyRateCents: 1500 },
      ],
      { until: new Date(), tz: TZ, sundayPremiumPct: 25, tipsCents: 3000 },
    );
    expect(rows[0]).toMatchObject({ hours: 12, sundayHours: 8, grossCents: 8 * 1500 * 1.25 + 4 * 1500, tipsCents: 3000 });
    const csv = payrollCsv(rows, "brightpay");
    expect(csv.split("\r\n")[0]).toBe('"Employee ID","Surname","Forename","Hours","Hourly Rate","Sunday Hours","Tips"');
    expect(csv).toContain('"E1","Byrne","Aoife","12.00","15.00","8.00","30.00"');
  });
});
