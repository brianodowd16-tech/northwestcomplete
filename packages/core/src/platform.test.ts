import { describe, expect, it } from "vitest";
import { invoiceNumber, invoicePeriod, nudgeEmail, nudgeStage, previousMonth, retryDelayMs, venueAlerts } from "./index";

describe("running at scale", () => {
  it("backs off email retries, then gives up", () => {
    expect([1, 2, 3, 4, 5].map((n) => retryDelayMs(n)! / 60_000)).toEqual([1, 5, 15, 60, 240]);
    expect(retryDelayMs(6)).toBeNull();
  });

  it("nudges stalled set-ups on day 2, 5 and 10 with the next step", () => {
    expect([0, 1, 2, 4, 5, 9, 10, 40].map(nudgeStage)).toEqual([null, null, 2, 2, 5, 5, 10, 10]);
    const m = nudgeEmail("Brady's", 2, ["Connect myPOS", "Add your VAT number"], "https://complete.pub/office/bradys/setup");
    expect(m.subject).toBe("Next step for Brady's: Connect myPOS");
    expect(m.text).toContain("• Add your VAT number");
    expect(nudgeEmail("Brady's", 10, [], "x").text).toContain("Reply to this email");
  });

  it("bills the month just ended with a stable number", () => {
    expect(previousMonth(new Date("2026-12-01T07:10:00Z"))).toEqual({ year: 2026, month: 11 });
    expect(previousMonth(new Date("2027-01-01T07:10:00Z"))).toEqual({ year: 2026, month: 12 });
    expect(invoiceNumber(invoicePeriod(2026, 11), "mj-oconnors")).toBe("CMP-202611-MJOCONNORS");
  });

  it("alerts on failed syncs, unmapped accounts and stuck payments only when live", () => {
    const base = { slug: "mj", syncErrors: [], xeroUnmapped: false, sageUnmapped: false, stuckPayments: 0, live: true };
    expect(venueAlerts(base)).toEqual([]);
    const a = venueAlerts({ ...base, syncErrors: [{ target: "xero", days: 2, lastError: "401 token expired" }], sageUnmapped: true, stuckPayments: 4 });
    expect(a.map((x) => x.key)).toEqual(["sync:xero", "sage:unmapped", "payments:stuck"]);
    expect(a[0]).toMatchObject({ title: "Xero sync failed on 2 days this week", href: "/office/mj/settings", severity: "error" });
    expect(venueAlerts({ ...base, stuckPayments: 4, live: false })).toEqual([]);
  });
});
