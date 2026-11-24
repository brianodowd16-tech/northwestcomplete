import { describe, expect, it } from "vitest";
import { pubScore, topGamesForDay, type Fixture } from "./sports";

const f = (league: string, home: string, away: string, iso: string): Fixture => ({ externalId: `${home}-${away}`, sport: "", league, home, away, startsAt: new Date(iso) });

describe("top games for Irish pubs", () => {
  it("puts Ireland and the big clubs first", () => {
    expect(pubScore(f("Six Nations Championship", "Ireland", "France", "2027-02-06T16:45:00Z"))).toBeGreaterThan(pubScore(f("English Premier League", "Liverpool", "Manchester United", "2027-02-06T17:30:00Z")));
    expect(pubScore(f("English Premier League", "Liverpool", "Manchester United", "2026-11-28T17:30:00Z"))).toBeGreaterThan(pubScore(f("English Premier League", "Fulham", "Bournemouth", "2026-11-28T15:00:00Z")));
    expect(pubScore(f("Norwegian Eliteserien", "Rosenborg", "Molde", "2026-11-28T17:00:00Z"))).toBe(0);
  });

  it("lists 3 to 5 games a day", () => {
    const day = [
      f("English Premier League", "Arsenal", "Manchester City", "2026-11-29T16:30:00Z"),
      f("English Premier League", "Everton", "Liverpool", "2026-11-29T12:00:00Z"),
      f("English Premier League", "Fulham", "Bournemouth", "2026-11-29T14:00:00Z"),
      f("United Rugby Championship", "Munster", "Leinster", "2026-11-29T17:30:00Z"),
      f("European Rugby Champions Cup", "Toulouse", "Bath", "2026-11-29T13:00:00Z"),
      f("UEFA Europa League", "Roma", "Porto", "2026-11-29T20:00:00Z"),
      f("Irish Premier Division", "Bohemians", "Derry City", "2026-11-29T19:45:00Z"),
      f("Norwegian Eliteserien", "Rosenborg", "Molde", "2026-11-29T17:00:00Z"),
    ];
    const top = topGamesForDay(day);
    expect(top.length).toBeGreaterThanOrEqual(3);
    expect(top.length).toBeLessThanOrEqual(5);
    expect(top.map((t) => t.home)).toEqual(expect.arrayContaining(["Munster", "Arsenal", "Everton"]));
    expect(top.map((t) => t.home)).not.toContain("Rosenborg");
  });

  it("lists nothing on a day with nothing worth showing", () => {
    expect(topGamesForDay([f("Norwegian Eliteserien", "Rosenborg", "Molde", "2026-11-29T17:00:00Z")])).toEqual([]);
  });
});

import { fplJoinUrl, parseFplCode } from "./sports";
describe("fantasy premier league", () => {
  it("accepts a code or a pasted invite link", () => {
    expect(parseFplCode(" AB12CD ")).toBe("ab12cd");
    expect(parseFplCode("https://fantasy.premierleague.com/leagues/auto-join/x9y8z7")).toBe("x9y8z7");
    expect(parseFplCode("not a code!")).toBeNull();
    expect(fplJoinUrl("ab12cd")).toBe("https://fantasy.premierleague.com/leagues/auto-join/ab12cd");
  });
});
