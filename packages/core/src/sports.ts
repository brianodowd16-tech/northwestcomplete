// Which televised games Irish pubs should list each day. Common-sense weights for what
// people go to the pub to watch in Ireland; tweak freely.

export interface Fixture {
  externalId: string;
  sport: string;
  league: string;
  home: string;
  away: string;
  startsAt: Date;
}

/** Competition weights (by the name the fixtures feed uses). Unlisted competitions are ignored. */
export const IRISH_PUB_COMPETITIONS: Record<string, { id: string; weight: number; sport: "rugby" | "soccer" | "gaa"; mins: number }> = {
  "Six Nations Championship": { id: "4714", weight: 100, sport: "rugby", mins: 120 },
  "Rugby World Cup": { id: "4574", weight: 100, sport: "rugby", mins: 120 },
  "All-Ireland Senior Football Championship": { id: "5564", weight: 90, sport: "gaa", mins: 100 },
  "All-Ireland Senior Hurling Championship": { id: "5565", weight: 90, sport: "gaa", mins: 100 },
  "European Rugby Champions Cup": { id: "4550", weight: 70, sport: "rugby", mins: 120 },
  "United Rugby Championship": { id: "4446", weight: 45, sport: "rugby", mins: 120 },
  "English Premier League": { id: "4328", weight: 55, sport: "soccer", mins: 120 },
  "UEFA Champions League": { id: "4480", weight: 60, sport: "soccer", mins: 120 },
  "FIFA World Cup": { id: "4429", weight: 95, sport: "soccer", mins: 120 },
  "UEFA European Championships": { id: "4502", weight: 90, sport: "soccer", mins: 120 },
  "UEFA Nations League": { id: "4490", weight: 40, sport: "soccer", mins: 120 },
  "FA Cup": { id: "4482", weight: 40, sport: "soccer", mins: 120 },
  "UEFA Europa League": { id: "4481", weight: 30, sport: "soccer", mins: 120 },
  "EFL Cup": { id: "4570", weight: 25, sport: "soccer", mins: 120 },
  "Irish Premier Division": { id: "4643", weight: 20, sport: "soccer", mins: 120 },
};

const IRISH = /\b(ireland|leinster|munster|ulster|connacht)\b/i;
const BIG_CLUBS = /\b(liverpool|manchester united|man utd|arsenal|chelsea|manchester city|man city|tottenham|celtic|rangers)\b/i;
const GAA_BIG = /\b(final|semi)/i;

/** Popularity score for an Irish pub audience; 0 means don't list it. */
export function pubScore(f: Fixture, tz = "Europe/Dublin"): number {
  const c = IRISH_PUB_COMPETITIONS[f.league];
  if (!c) return 0;
  let s = c.weight;
  const teams = `${f.home} ${f.away}`;
  if (IRISH.test(teams)) s += c.sport === "soccer" ? 45 : 40; // Ireland or an Irish province playing
  const big = (teams.match(new RegExp(BIG_CLUBS, "gi")) ?? []).length;
  s += big === 2 ? 30 : big === 1 ? 15 : 0; // Liverpool v Man United beats Fulham v Bournemouth
  if (c.sport === "gaa" && GAA_BIG.test(`${f.home} ${f.away} ${f.league}`)) s += 20;
  // People watch in the pub in the evening and at weekends.
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(f.startsAt).map((p) => [p.type, p.value]));
  const hour = Number(parts.hour), weekend = parts.weekday === "Sat" || parts.weekday === "Sun";
  if (hour < 11 || hour >= 23) s -= 30;
  else if (weekend || hour >= 17) s += 10;
  return Math.max(0, s);
}

/** The day's top games: up to 5, at least 3 if there are 3 worth showing, never the also-rans. */
export function topGamesForDay(fixtures: Fixture[], tz = "Europe/Dublin"): (Fixture & { score: number; mins: number })[] {
  const scored = fixtures
    .map((f) => ({ ...f, score: pubScore(f, tz), mins: IRISH_PUB_COMPETITIONS[f.league]?.mins ?? 120 }))
    .filter((f) => f.score >= 30)
    .sort((a, b) => b.score - a.score || a.startsAt.getTime() - b.startsAt.getTime());
  const strong = scored.filter((f) => f.score >= 60);
  const n = Math.min(5, Math.max(3, strong.length));
  return scored.slice(0, n).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

/** A Fantasy Premier League invite code, from the code itself or a pasted invite link. Null if it isn't one. */
export function parseFplCode(input: string): string | null {
  const s = String(input ?? "").trim();
  const m = /auto-join\/([a-z0-9]{4,12})/i.exec(s) ?? /^([a-z0-9]{4,12})$/i.exec(s);
  return m ? m[1].toLowerCase() : null;
}

/** FPL's own invite link: signs the guest in (or up) and joins them to the league. */
export const fplJoinUrl = (code: string) => `https://fantasy.premierleague.com/leagues/auto-join/${encodeURIComponent(code)}`;
