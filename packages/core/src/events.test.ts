import { describe, expect, it } from "vitest";
import { occurrences, toIcs, utcToZoned, validateEvent, zonedToUtc, type StoredEvent } from "./events";

const TZ = "Europe/Dublin";

describe("venue time", () => {
  it("converts local Dublin time in winter and summer", () => {
    expect(zonedToUtc("2026-12-05T20:00", TZ).toISOString()).toBe("2026-12-05T20:00:00.000Z");
    expect(zonedToUtc("2026-07-05T20:00", TZ).toISOString()).toBe("2026-07-05T19:00:00.000Z");
    expect(utcToZoned(new Date("2026-07-05T19:00:00Z"), TZ)).toBe("2026-07-05T20:00");
  });
});

describe("events", () => {
  const ev = (patch: Partial<StoredEvent>): StoredEvent => ({ id: "e1", kind: "music", title: "Trad session", details: "", where: "", startsAt: zonedToUtc("2026-10-22T21:00", TZ), durationMins: 180, repeatWeekly: true, repeatUntil: null, coverCents: 0, ...patch });

  it("validates what a manager types", () => {
    expect(validateEvent({ kind: "sport", title: " Ireland v France ", startsLocal: "2027-02-06T16:45", durationMins: 120 }, TZ)).toMatchObject({ title: "Ireland v France", startsAt: new Date("2027-02-06T16:45:00Z") });
    expect(() => validateEvent({ kind: "rave", title: "x y", startsLocal: "2027-02-06T16:45" }, TZ)).toThrow(/kind/);
    expect(() => validateEvent({ kind: "music", title: "Gig", startsLocal: "tomorrow" }, TZ)).toThrow(/date and time/);
  });

  it("repeats weekly at the same local time across the clocks going back", () => {
    const occ = occurrences([ev({})], new Date("2026-10-20T00:00:00Z"), new Date("2026-11-06T00:00:00Z"), TZ);
    expect(occ.map((o) => utcToZoned(o.start, TZ))).toEqual(["2026-10-22T21:00", "2026-10-29T21:00", "2026-11-05T21:00"]);
    expect(occ[0].start.toISOString()).toBe("2026-10-22T20:00:00.000Z"); // summer time
    expect(occ[1].start.toISOString()).toBe("2026-10-29T21:00:00.000Z"); // winter time
  });

  it("stops repeating after the last date and finds far-future weeks quickly", () => {
    expect(occurrences([ev({ repeatUntil: "2026-10-29" })], new Date("2026-10-01T00:00:00Z"), new Date("2026-12-31T00:00:00Z"), TZ)).toHaveLength(2);
    expect(occurrences([ev({})], new Date("2030-01-01T00:00:00Z"), new Date("2030-01-15T00:00:00Z"), TZ)).toHaveLength(2);
  });

  it("includes an event already under way", () => {
    const one = ev({ repeatWeekly: false, startsAt: new Date("2026-11-24T19:00:00Z") });
    expect(occurrences([one], new Date("2026-11-24T20:00:00Z"), new Date("2026-11-25T00:00:00Z"), TZ)).toHaveLength(1);
  });

  it("writes a valid calendar file", () => {
    const occ = occurrences([ev({ title: "Trad session, with Seán; all welcome", details: "Bring an instrument" })], new Date("2026-10-20T00:00:00Z"), new Date("2026-10-25T00:00:00Z"), TZ);
    const ics = toIcs("MJ's: What's on", occ, { url: "https://complete.pub/v/mj/events", location: "MJ O'Connor's", host: "complete.pub" });
    expect(ics).toMatch(/^BEGIN:VCALENDAR\r\n/);
    expect(ics).toContain("DTSTART:20261022T200000Z");
    expect(ics).toContain("Trad session\\, with Seán\; all welcome");
    expect(ics.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
  });
});
