import "server-only";
import { IRISH_PUB_COMPETITIONS, localDate, topGamesForDay, zonedToUtc, type Fixture } from "@round/core";
import { saveTopGames } from "@round/db/events";

// Fixtures from TheSportsDB. The free key ("123") returns up to 3 games per competition per day and
// allows ~30 requests a minute; set SPORTSDB_KEY to a paid key for full fixture lists.
const KEY = () => process.env.SPORTSDB_KEY || "123";
const BASE = () => `https://www.thesportsdb.com/api/v1/json/${KEY()}`;
const TZ = "Europe/Dublin";
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get<T>(path: string): Promise<T | null> {
  const res = await fetch(`${BASE()}/${path}`, { headers: { "User-Agent": "Complete/1.0" }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`fixtures feed ${res.status}`);
  return (await res.json().catch(() => null)) as T | null;
}

/** Fetches the next `days` days for the competitions Irish pubs show, ranks each day, stores the top 3–5. */
export async function refreshTopGames(days = 7) {
  const leagues = Object.values(IRISH_PUB_COMPETITIONS).map((c) => ({ idLeague: c.id }));
  const out = [];
  for (let d = 0; d < days; d++) {
    const date = localDate(new Date(Date.now() + d * 86_400_000), TZ);
    const fixtures: Fixture[] = [];
    for (const l of leagues) {
      const r = await get<{ events: { idEvent: string; strSport: string; strLeague: string; strHomeTeam: string; strAwayTeam: string; strTimestamp: string | null; dateEvent: string; strTime: string | null; strStatus: string | null }[] | null }>(
        `eventsday.php?d=${date}&l=${l.idLeague}`,
      ).catch(() => null);
      for (const e of r?.events ?? []) {
        const iso = e.strTimestamp ? `${e.strTimestamp.replace(/Z$/, "")}Z` : e.strTime ? `${e.dateEvent}T${e.strTime.slice(0, 8)}Z` : null;
        if (!iso || !e.strHomeTeam || /postponed|cancel/i.test(e.strStatus ?? "")) continue;
        fixtures.push({ externalId: `tsdb-${e.idEvent}`, sport: e.strSport, league: e.strLeague, home: e.strHomeTeam, away: e.strAwayTeam, startsAt: new Date(iso) });
      }
      await pause(KEY() === "123" ? 2_100 : 200);
    }
    const from = zonedToUtc(`${date}T00:00`, TZ), to = zonedToUtc(`${localDate(new Date(from.getTime() + 30 * 3600_000), TZ)}T00:00`, TZ);
    out.push({ from, to, games: topGamesForDay(fixtures.filter((f) => f.startsAt >= from && f.startsAt < to), TZ) });
  }
  await saveTopGames(out);
  return out.reduce((s, d) => s + d.games.length, 0);
}
