import { EventError, occurrences, validateEvent, type EventInput, type StoredEvent } from "@round/core";
import { and, asc, eq } from "drizzle-orm";
import { publish, topics, withTenant } from "./index";
import * as t from "./schema";
import type { Venue } from "./services";

/** Everything on at the venue between `from` and `to`, with weekly events expanded. */
export async function whatsOn(venue: Venue, from: Date, to: Date) {
  const rows = await withTenant(venue.tenantId, (tx) => tx.select().from(t.venueEvent).where(eq(t.venueEvent.venueId, venue.id)));
  return occurrences(rows as StoredEvent[], from, to, venue.timezone);
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
