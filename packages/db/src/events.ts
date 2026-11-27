import { cached } from "./cache";
import { EventError, occurrences, parseFplCode, validateEvent, type EventInput, type StoredEvent } from "@round/core";
import { and, asc, eq, gte, lt, sql } from "drizzle-orm";
import { systemDb } from "./index";
import { publish, topics, withTenant } from "./index";
import * as t from "./schema";
import type { Venue } from "./services";

/** Everything on at the venue between `from` and `to`: its own events (weekly ones expanded) plus, if switched on, the day's top games. */
export async function whatsOn(venue: Venue, from: Date, to: Date) {
  const minute = (d: Date) => Math.floor(d.getTime() / 60_000);
  return cached(`events:${venue.id}:${minute(from)}:${minute(to)}`, 30_000, () => whatsOnUncached(venue, from, to));
}

async function whatsOnUncached(venue: Venue, from: Date, to: Date) {
  const rows = await withTenant(venue.tenantId, (tx) => tx.select().from(t.venueEvent).where(eq(t.venueEvent.venueId, venue.id)));
  const own = occurrences(rows as StoredEvent[], from, to, venue.timezone);
  if (!venue.autoSports) return own.map((o) => ({ ...o, auto: false }));
  const games = await systemDb()
    .select()
    .from(t.sportFixture)
    .where(and(gte(t.sportFixture.startsAt, new Date(from.getTime() - 3 * 3600_000)), lt(t.sportFixture.startsAt, to)));
  // A game the venue listed itself (same teams that day) isn't shown twice.
  const ownKeys = new Set(own.filter((o) => o.kind === "sport").map((o) => o.title.toLowerCase()));
  const auto = games
    .map((g) => {
      const start = g.startsAt, end = new Date(start.getTime() + g.durationMins * 60_000);
      return { id: g.id, key: `sport:${g.externalId}`, kind: "sport" as const, title: `${g.home} v ${g.away}`, details: g.league, where: "On the TVs", startsAt: start, durationMins: g.durationMins, repeatWeekly: false, repeatUntil: null, coverCents: 0, partnerVenueId: null, start, end, auto: true };
    })
    .filter((g) => g.end > from && !ownKeys.has(g.title.toLowerCase()));
  return [...own.map((o) => ({ ...o, auto: false })), ...auto].sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Replaces the stored top games for the given days (the feed job calls this once a day). */
export async function saveTopGames(days: { from: Date; to: Date; games: { externalId: string; sport: string; league: string; home: string; away: string; startsAt: Date; mins: number; score: number }[] }[]) {
  const db = systemDb();
  await db.transaction(async (tx) => {
    for (const d of days) {
      await tx.delete(t.sportFixture).where(and(gte(t.sportFixture.startsAt, d.from), lt(t.sportFixture.startsAt, d.to)));
      if (d.games.length)
        await tx.insert(t.sportFixture).values(d.games.map((g) => ({ externalId: g.externalId, sport: g.sport, league: g.league, home: g.home, away: g.away, startsAt: g.startsAt, durationMins: g.mins, score: g.score }))).onConflictDoNothing();
    }
  });
}

export async function setAutoSports(venue: Venue, on: boolean) {
  await withTenant(venue.tenantId, (tx) => tx.update(t.venue).set({ autoSports: on }).where(eq(t.venue.id, venue.id)));
}

export async function listEvents(venue: Venue) {
  return withTenant(venue.tenantId, (tx) => tx.select().from(t.venueEvent).where(eq(t.venueEvent.venueId, venue.id)).orderBy(asc(t.venueEvent.startsAt)));
}

export async function saveEvent(venue: Venue, input: EventInput & { id?: string }) {
  const values = validateEvent(input, venue.timezone);
  return withTenant(venue.tenantId, async (tx) => {
    let row;
    if (input.id) {
      [row] = await tx.update(t.venueEvent).set(values).where(and(eq(t.venueEvent.id, input.id), eq(t.venueEvent.venueId, venue.id))).returning();
      if (!row) throw new EventError("Event not found");
    } else [row] = await tx.insert(t.venueEvent).values({ ...values, tenantId: venue.tenantId, venueId: venue.id }).returning();
    await publish(tx, topics.venue(venue.id), { kind: "events" });
    return row;
  });
}

export async function deleteEvent(venue: Venue, id: string) {
  await withTenant(venue.tenantId, async (tx) => {
    const r = await tx.delete(t.venueEvent).where(and(eq(t.venueEvent.id, id), eq(t.venueEvent.venueId, venue.id))).returning();
    if (!r.length) throw new EventError("Event not found");
  });
}

export async function setFplCode(venue: Venue, input: string) {
  const s = String(input ?? "").trim();
  const code = s ? parseFplCode(s) : null;
  if (s && !code) throw new EventError("That doesn't look like a Fantasy Premier League invite code or link");
  await withTenant(venue.tenantId, (tx) => tx.update(t.venue).set({ fplCode: code }).where(eq(t.venue.id, venue.id)));
}

/** Counts a guest following the venue's FPL link. */
export async function countFplClick(venue: Venue) {
  await withTenant(venue.tenantId, (tx) => tx.update(t.venue).set({ fplClicks: sql`${t.venue.fplClicks} + 1` }).where(eq(t.venue.id, venue.id)));
}

/** Marks an event as co-hosted with another live venue on Complete (posted on both venues' social accounts). */
export async function setEventPartner(venue: Venue, eventId: string, partnerVenueId: string | null) {
  if (partnerVenueId) {
    const [p] = await systemDb().select({ id: t.venue.id, status: t.venue.status }).from(t.venue).where(eq(t.venue.id, partnerVenueId));
    if (!p || p.id === venue.id || p.status !== "live") throw new EventError("Choose another live venue on Complete");
  }
  await withTenant(venue.tenantId, (tx) => tx.update(t.venueEvent).set({ partnerVenueId }).where(and(eq(t.venueEvent.id, eventId), eq(t.venueEvent.venueId, venue.id))));
}
