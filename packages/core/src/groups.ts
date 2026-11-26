// Groups, sessions, shared costs and leaderboards: the rules, without the database.
import { randomBytes } from "node:crypto";

export class GroupError extends Error {}

export const inviteCode = () => randomBytes(6).toString("base64url").replace(/[-_]/g, "x").slice(0, 8);

/** A chat message: trimmed, 1 to 1,000 characters, no control characters. */
export function cleanMessage(body: unknown): string {
  const s = String(body ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  if (!s) throw new GroupError("Write a message");
  if (s.length > 1000) throw new GroupError("Keep messages under 1,000 characters");
  return s;
}

export function cleanGroupName(name: unknown): string {
  const s = String(name ?? "").replace(/\s+/g, " ").trim();
  if (s.length < 2 || s.length > 60) throw new GroupError("Give the group a name (2 to 60 characters)");
  return s;
}

/**
 * Spotify links (open.spotify.com) for a track, album or playlist. Only links: Spotify's
 * developer policy doesn't allow software that plays Spotify in bars or restaurants, so
 * the venue plays requests on its own licensed system.
 */
export function spotifyLink(url: unknown): { kind: "track" | "album" | "playlist"; id: string; url: string } | null {
  const m = String(url ?? "").trim().match(/^https:\/\/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(track|album|playlist)\/([A-Za-z0-9]{10,40})/);
  return m ? { kind: m[1] as "track" | "album" | "playlist", id: m[2], url: `https://open.spotify.com/${m[1]}/${m[2]}` } : null;
}

// ---------------------------------------------------------------- splitting

/** Splits `total` cents over `n` people; the first people take the leftover cents. */
export function splitEqual(total: number, n: number): number[] {
  if (!Number.isInteger(total) || total <= 0) throw new GroupError("Enter an amount");
  if (n < 1) throw new GroupError("Choose who's splitting");
  const base = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) => base + (i < total - base * n ? 1 : 0));
}

/**
 * By item: each line is paid by whoever claimed it (shared equally if several did);
 * lines nobody claimed are shared by everyone. Returns cents per person, summing to the total.
 */
export function splitByItems(lines: { id: string; cents: number }[], people: string[], claims: Record<string, string[]>): Record<string, number> {
  if (!people.length) throw new GroupError("Choose who's splitting");
  const out: Record<string, number> = Object.fromEntries(people.map((p) => [p, 0]));
  for (const line of lines) {
    const who = people.filter((p) => (claims[p] ?? []).includes(line.id));
    const payers = who.length ? who : people;
    splitEqual(line.cents, payers.length).forEach((c, i) => (out[payers[i]] += c));
  }
  return out;
}

/** Custom amounts must add up to the bill exactly. */
export function checkCustom(total: number, amounts: Record<string, number>): Record<string, number> {
  const vals = Object.values(amounts);
  if (vals.some((v) => !Number.isInteger(v) || v < 0)) throw new GroupError("Amounts must be zero or more");
  const sum = vals.reduce((s, v) => s + v, 0);
  if (sum !== total) throw new GroupError(`The shares add up to €${(sum / 100).toFixed(2)}, not €${(total / 100).toFixed(2)}`);
  return amounts;
}

export interface ShareRow { payer: string; debtor: string; cents: number; status: "owed" | "paid" | "covered" }

/** Who owes whom overall, simplified to the fewest payments (largest debtor pays largest creditor). */
export function settleUp(shares: ShareRow[]): { from: string; to: string; cents: number }[] {
  const net = new Map<string, number>();
  for (const s of shares) {
    if (s.status !== "owed" || s.payer === s.debtor || s.cents <= 0) continue;
    net.set(s.debtor, (net.get(s.debtor) ?? 0) - s.cents);
    net.set(s.payer, (net.get(s.payer) ?? 0) + s.cents);
  }
  const debtors = [...net].filter(([, v]) => v < 0).map(([k, v]) => ({ k, v: -v })).sort((a, b) => b.v - a.v || a.k.localeCompare(b.k));
  const creditors = [...net].filter(([, v]) => v > 0).map(([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v || a.k.localeCompare(b.k));
  const out: { from: string; to: string; cents: number }[] = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const c = Math.min(debtors[i].v, creditors[j].v);
    out.push({ from: debtors[i].k, to: creditors[j].k, cents: c });
    debtors[i].v -= c;
    creditors[j].v -= c;
    if (!debtors[i].v) i++;
    if (!creditors[j].v) j++;
  }
  return out;
}

/** A Revolut handle someone can be paid at (revolut.me), or null. */
export function revolutLink(handle: string | null | undefined): string | null {
  const h = String(handle ?? "").trim().replace(/^@/, "").replace(/^https:\/\/revolut\.me\//, "");
  return /^[a-z0-9._-]{3,32}$/i.test(h) ? `https://revolut.me/${h}` : null;
}

// ---------------------------------------------------------------- leaderboards

/** A public leaderboard name: 2 to 24 letters, numbers, spaces, . ' - (no links, no emails). */
export function cleanLeaderboardName(name: unknown): string {
  const s = String(name ?? "").replace(/\s+/g, " ").trim();
  if (!/^[\p{L}\p{N} .'-]{2,24}$/u.test(s)) throw new GroupError("Pick a display name of 2 to 24 letters or numbers");
  return s;
}

/** Ranks rows by score, highest first; equal scores share a rank ("2=", "2="). */
export function rankRows<T extends { score: number }>(rows: T[], limit = 50): (T & { rank: number; tied: boolean })[] {
  const sorted = [...rows].filter((r) => r.score > 0).sort((a, b) => b.score - a.score);
  return sorted.slice(0, limit).map((r) => {
    const rank = sorted.findIndex((x) => x.score === r.score) + 1;
    return { ...r, rank, tied: sorted.filter((x) => x.score === r.score).length > 1 };
  });
}

export const IRISH_COUNTIES = [
  "Carlow", "Cavan", "Clare", "Cork", "Donegal", "Dublin", "Galway", "Kerry", "Kildare", "Kilkenny", "Laois", "Leitrim", "Limerick",
  "Longford", "Louth", "Mayo", "Meath", "Monaghan", "Offaly", "Roscommon", "Sligo", "Tipperary", "Waterford", "Westmeath", "Wexford", "Wicklow",
] as const;
