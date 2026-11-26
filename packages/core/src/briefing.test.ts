import { describe, expect, it } from "vitest";
import { buildBriefing, type BriefingFacts } from "./index";

const base: BriefingFacts = {
  venue: "MJ's", firstName: "Niamh", hour: 19, weekday: "Tuesday", slug: "mj",
  today: { salesCents: 124000, orders: 63, sameTimeLastWeekCents: 110000, refundsCents: 0, topItem: { name: "Fish & chips", qty: 21 } },
  week: { salesCents: 842000, orders: 410, previousCents: 860000, topItem: { name: "Pint of stout", qty: 300 }, bestDay: { day: "Saturday", salesCents: 230000 } },
  bookingsTonight: { count: 2, covers: 9, next: "20:30" }, staffOn: ["Seán", "Aoife"], rotaToday: 3,
  lowStock: ["Lemons", "Tonic", "Cod", "Chips"], alerts: [{ title: "Xero sync failed once this week", href: "/office/mj/settings", severity: "error" }], socialToApprove: 1, songsWaiting: 0,
};

describe("manager briefing", () => {
  it("says the day and week in plain sentences with comparisons", () => {
    const b = buildBriefing(base);
    expect(b.greeting).toBe("Good evening, Niamh");
    expect(b.today[0]).toBe("So far today: €1,240 from 63 orders, up 13% on last Tuesday at this time.");
    expect(b.today).toContain("2 bookings still to come today (9 people), next at 20:30.");
    expect(b.today).toContain("On shift now: Seán and Aoife.");
    expect(b.week[0]).toBe("Last 7 days: €8,420 from 410 orders, about the same as the week before.");
  });

  it("lists what needs the manager, most serious first", () => {
    const b = buildBriefing(base);
    expect(b.attention.map((a) => a.tone)).toEqual(["error", "warn", "info"]);
    expect(b.attention[1].text).toBe("Running low: Lemons, Tonic and Cod and 1 more");
  });

  it("handles a quiet start", () => {
    const b = buildBriefing({ ...base, hour: 9, today: { ...base.today, salesCents: 0, orders: 0, topItem: null }, staffOn: [], bookingsTonight: { count: 0, covers: 0, next: null } });
    expect(b.greeting).toBe("Good morning, Niamh");
    expect(b.today).toEqual(["No sales yet today.", "3 people are rostered today; nobody is clocked in yet."]);
  });
});
