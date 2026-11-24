// Service rules every venue expects: allergens, opening hours and pauses, tips, discounts.
import { divRoundHalfUp, vatFromGross, type VatRate } from "./money";

export class ServiceError extends Error {}

/** The 14 allergens EU law (Regulation 1169/2011) requires venues to declare. */
export const ALLERGENS = {
  gluten: "Cereals containing gluten",
  crustaceans: "Crustaceans",
  eggs: "Eggs",
  fish: "Fish",
  peanuts: "Peanuts",
  soya: "Soya",
  milk: "Milk",
  nuts: "Tree nuts",
  celery: "Celery",
  mustard: "Mustard",
  sesame: "Sesame",
  sulphites: "Sulphites",
  lupin: "Lupin",
  molluscs: "Molluscs",
} as const;
export type Allergen = keyof typeof ALLERGENS;
export const cleanAllergens = (xs: unknown): Allergen[] => (Array.isArray(xs) ? [...new Set(xs.filter((x): x is Allergen => typeof x === "string" && x in ALLERGENS))] : []);

export type Hours = { bar?: ([string, string] | null)[]; kitchen?: ([string, string] | null)[] } | null;

const local = (d: Date, tz: string) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
  return { dow: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday), mins: Number(p.hour) * 60 + Number(p.minute) };
};
const toMins = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/**
 * Whether a station takes orders now. Hours past midnight ("12:00"–"01:30") belong to the day they
 * started. Staff can pause a station (kitchen slammed) until a time.
 */
export function stationOpen(hours: Hours, paused: { bar?: string; kitchen?: string } | null, station: "bar" | "kitchen", at: Date, tz: string): { open: boolean; reason?: string } {
  const p = paused?.[station];
  if (p && new Date(p) > at) {
    const until = new Date(p).toLocaleTimeString("en-IE", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
    return { open: false, reason: station === "kitchen" ? `The kitchen is very busy: food orders open again at ${until}` : `The bar has paused app orders until ${until}` };
  }
  const week = hours?.[station];
  if (!week) return { open: true };
  const { dow, mins } = local(at, tz);
  const today = week[dow], yesterday = week[(dow + 6) % 7];
  const inSpan = (span: [string, string] | null | undefined, m: number, prevDay: boolean) => {
    if (!span) return false;
    const o = toMins(span[0]), c = toMins(span[1]);
    if (c > o) return !prevDay && m >= o && m < c;
    return prevDay ? m < c : m >= o; // closes after midnight
  };
  if (inSpan(today, mins, false) || inSpan(yesterday, mins, true)) return { open: true };
  const label = station === "kitchen" ? "The kitchen" : "The bar";
  return { open: false, reason: today ? `${label} is closed now. It's open ${today[0]}–${today[1]} today.` : `${label} is closed today.` };
}

/** Tip on the amount being paid, as a percentage (half-up), capped. */
export function tipFor(baseCents: number, pct: number): number {
  if (!Number.isFinite(pct) || pct < 0 || pct > 30) throw new ServiceError("Choose a tip between 0 and 30%");
  return divRoundHalfUp(Math.round(baseCents * pct * 10), 1000);
}
export function checkTip(tipCents: number, baseCents: number) {
  if (!Number.isInteger(tipCents) || tipCents < 0) throw new ServiceError("Invalid tip");
  if (tipCents > Math.max(2000, Math.round(baseCents * 0.5)) || tipCents > 20_000) throw new ServiceError("That tip looks too big. Check the amount.");
}

/**
 * Spreads a discount across lines in proportion to their value (largest remainder, so it adds up
 * exactly), then re-works VAT per line: a discount reduces the VAT due.
 */
export function discountLines<T extends { grossCents: number; vatRate: VatRate }>(lines: T[], discountCents: number): (T & { grossCents: number; vatCents: number })[] {
  const total = lines.reduce((s, l) => s + l.grossCents, 0);
  if (!Number.isInteger(discountCents) || discountCents < 0 || discountCents > total) throw new ServiceError("The discount can't be more than the bill");
  const shares = lines.map((l) => (total ? (l.grossCents * discountCents) / total : 0));
  const floors = shares.map(Math.floor);
  let left = discountCents - floors.reduce((a, b) => a + b, 0);
  const order = shares.map((s, i) => [s - floors[i], i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    floors[i]++;
    left--;
  }
  return lines.map((l, i) => {
    const g = l.grossCents - floors[i];
    return { ...l, grossCents: g, vatCents: vatFromGross(g, l.vatRate) };
  });
}
