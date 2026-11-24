import { CartError, localDate, zonedToUtc } from "@round/core";
import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { withTenant } from "./index";
import * as t from "./schema";
import { NotFound, type Staff, type Venue } from "./services";

type Role = "bar" | "floor" | "kitchen" | "manager" | "other";
const ROLES: Role[] = ["bar", "floor", "kitchen", "manager", "other"];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Monday 00:00 (venue time) of the week containing `date` (YYYY-MM-DD). */
export function weekStart(date: string, tz: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  return localDate(new Date(d.getTime() - dow * 86_400_000), "UTC");
}
const addDays = (date: string, n: number) => localDate(new Date(new Date(`${date}T12:00:00Z`).getTime() + n * 86_400_000), "UTC");

export async function weekRota(venue: Venue, monday: string) {
  const from = zonedToUtc(`${monday}T00:00`, venue.timezone), to = zonedToUtc(`${addDays(monday, 7)}T00:00`, venue.timezone);
  return withTenant(venue.tenantId, async (tx) => {
    const team = await tx.select({ id: t.staffUser.id, name: t.staffUser.name, role: t.staffUser.role, hourlyRateCents: t.staffUser.hourlyRateCents }).from(t.staffUser).where(eq(t.staffUser.venueId, venue.id)).orderBy(asc(t.staffUser.name));
    const shifts = await tx.select().from(t.rotaShift).where(and(eq(t.rotaShift.venueId, venue.id), gte(t.rotaShift.startsAt, from), lt(t.rotaShift.startsAt, to))).orderBy(asc(t.rotaShift.startsAt));
    const unavailable = await tx.select().from(t.staffUnavailable).where(and(eq(t.staffUnavailable.venueId, venue.id), gte(t.staffUnavailable.date, monday), lt(t.staffUnavailable.date, addDays(monday, 7))));
    const worked = await tx.select().from(t.staffShift).where(and(eq(t.staffShift.venueId, venue.id), gte(t.staffShift.clockIn, new Date(from.getTime() - 6 * 3_600_000)), lt(t.staffShift.clockIn, to)));
    const names = new Map(team.map((m) => [m.id, m.name]));
    return {
      team,
      days: Array.from({ length: 7 }, (_, i) => addDays(monday, i)),
      shifts: shifts.map((s) => ({ ...s, name: names.get(s.staffId) ?? "" })),
      unavailable: unavailable.map((u) => ({ staffId: u.staffId, date: u.date, note: u.note })),
      worked,
    };
  });
}

/** Adds or changes a planned shift. A finish at or before the start runs past midnight. */
export async function saveShift(venue: Venue, input: { id?: string; staffId: string; date: string; start: string; end: string; role: string; note?: string }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !HHMM.test(input.start) || !HHMM.test(input.end)) throw new CartError("Choose a day and times like 17:00");
  if (!ROLES.includes(input.role as Role)) throw new CartError("Choose a role");
  const startsAt = zonedToUtc(`${input.date}T${input.start}`, venue.timezone);
  let endsAt = zonedToUtc(`${input.date}T${input.end}`, venue.timezone);
  if (endsAt <= startsAt) endsAt = zonedToUtc(`${addDays(input.date, 1)}T${input.end}`, venue.timezone);
  if (endsAt.getTime() - startsAt.getTime() > 16 * 3_600_000) throw new CartError("A shift can't be longer than 16 hours");
  return withTenant(venue.tenantId, async (tx) => {
    const [who] = await tx.select().from(t.staffUser).where(and(eq(t.staffUser.id, input.staffId), eq(t.staffUser.venueId, venue.id)));
    if (!who) throw new NotFound("Team member not found");
    const values = { staffId: who.id, startsAt, endsAt, role: input.role as Role, note: String(input.note ?? "").slice(0, 120), published: false };
    if (input.id) {
      const [r] = await tx.update(t.rotaShift).set(values).where(and(eq(t.rotaShift.id, input.id), eq(t.rotaShift.venueId, venue.id))).returning();
      if (!r) throw new NotFound("Shift not found");
      return r;
    }
    const [r] = await tx.insert(t.rotaShift).values({ ...values, tenantId: venue.tenantId, venueId: venue.id }).returning();
    return r;
  });
}

export async function deleteShift(venue: Venue, id: string) {
  await withTenant(venue.tenantId, (tx) => tx.delete(t.rotaShift).where(and(eq(t.rotaShift.id, id), eq(t.rotaShift.venueId, venue.id))));
}

/** Copies one week's shifts into another (as unpublished), skipping any already there. */
export async function copyWeek(venue: Venue, fromMonday: string, toMonday: string) {
  const src = await weekRota(venue, fromMonday);
  const dst = await weekRota(venue, toMonday);
  const shift = new Date(`${toMonday}T12:00:00Z`).getTime() - new Date(`${fromMonday}T12:00:00Z`).getTime();
  const fresh = src.shifts.filter((s) => !dst.shifts.some((d) => d.staffId === s.staffId && Math.abs(d.startsAt.getTime() - (s.startsAt.getTime() + shift)) < 3_600_000));
  if (!fresh.length) return 0;
  await withTenant(venue.tenantId, (tx) =>
    tx.insert(t.rotaShift).values(fresh.map((s) => ({ tenantId: venue.tenantId, venueId: venue.id, staffId: s.staffId, startsAt: new Date(s.startsAt.getTime() + shift), endsAt: new Date(s.endsAt.getTime() + shift), role: s.role, note: s.note }))),
  );
  return fresh.length;
}

/** Publishes the week: staff see their shifts. Returns who to tell. */
export async function publishWeek(venue: Venue, monday: string) {
  const from = zonedToUtc(`${monday}T00:00`, venue.timezone), to = zonedToUtc(`${addDays(monday, 7)}T00:00`, venue.timezone);
  return withTenant(venue.tenantId, async (tx) => {
    const rows = await tx.update(t.rotaShift).set({ published: true }).where(and(eq(t.rotaShift.venueId, venue.id), gte(t.rotaShift.startsAt, from), lt(t.rotaShift.startsAt, to))).returning();
    const ids = [...new Set(rows.map((r) => r.staffId))];
    const team = ids.length ? await tx.select().from(t.staffUser).where(inArray(t.staffUser.id, ids)) : [];
    return team.map((m) => ({ name: m.name, email: m.email, shifts: rows.filter((r) => r.staffId === m.id).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()) }));
  });
}

/** A team member's own published shifts and days off, and who else is on today. */
export async function myRota(staff: Staff, from: Date, to: Date) {
  return withTenant(staff.tenantId, async (tx) => {
    const mine = await tx.select().from(t.rotaShift).where(and(eq(t.rotaShift.staffId, staff.id), eq(t.rotaShift.published, true), gte(t.rotaShift.endsAt, from), lt(t.rotaShift.startsAt, to))).orderBy(asc(t.rotaShift.startsAt));
    const off = await tx.select().from(t.staffUnavailable).where(and(eq(t.staffUnavailable.staffId, staff.id), gte(t.staffUnavailable.date, localDate(from, "UTC")))).orderBy(asc(t.staffUnavailable.date));
    const dayEnd = new Date(from.getTime() + 24 * 3_600_000);
    const today = await tx
      .select({ s: t.rotaShift, name: t.staffUser.name })
      .from(t.rotaShift)
      .innerJoin(t.staffUser, eq(t.staffUser.id, t.rotaShift.staffId))
      .where(and(eq(t.rotaShift.venueId, staff.venueId), eq(t.rotaShift.published, true), gte(t.rotaShift.endsAt, from), lt(t.rotaShift.startsAt, dayEnd)))
      .orderBy(asc(t.rotaShift.startsAt));
    return { mine, off, today: today.map((r) => ({ ...r.s, name: r.name })) };
  });
}

export async function setUnavailable(staff: Staff, date: string, on: boolean, note = "") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new CartError("Choose a day");
  await withTenant(staff.tenantId, async (tx) => {
    if (on) await tx.insert(t.staffUnavailable).values({ tenantId: staff.tenantId, venueId: staff.venueId, staffId: staff.id, date, note: note.slice(0, 120) }).onConflictDoNothing();
    else await tx.delete(t.staffUnavailable).where(and(eq(t.staffUnavailable.staffId, staff.id), eq(t.staffUnavailable.date, date)));
  });
}

// ---------------------------------------------------------------- payroll

/** Clock-ins, people and tips for a pay period, ready for `payrollPeriod`. */
export async function payrollData(venue: Venue, from: Date, to: Date) {
  return withTenant(venue.tenantId, async (tx) => {
    const rows = await tx
      .select({ s: t.staffShift, name: t.staffUser.name, email: t.staffUser.email, payrollRef: t.staffUser.payrollRef })
      .from(t.staffShift)
      .innerJoin(t.staffUser, eq(t.staffUser.id, t.staffShift.staffId))
      .where(and(eq(t.staffShift.venueId, venue.id), gte(t.staffShift.clockIn, from), lt(t.staffShift.clockIn, to)));
    const [tips] = await tx
      .select({ c: sql<number>`coalesce(sum(${t.orders.tipCents}),0)::int` })
      .from(t.orders)
      .where(and(eq(t.orders.venueId, venue.id), eq(t.orders.status, "paid"), gte(t.orders.paidAt, from), lt(t.orders.paidAt, to)));
    const team = await tx.select({ id: t.staffUser.id, name: t.staffUser.name, payrollRef: t.staffUser.payrollRef, hourlyRateCents: t.staffUser.hourlyRateCents }).from(t.staffUser).where(eq(t.staffUser.venueId, venue.id)).orderBy(asc(t.staffUser.name));
    return {
      shifts: rows.map((r) => ({ staffId: r.s.staffId, name: r.name, email: r.email, payrollRef: r.payrollRef, clockIn: r.s.clockIn, clockOut: r.s.clockOut, hourlyRateCents: r.s.hourlyRateCents })),
      tipsCents: tips.c,
      team,
    };
  });
}

export async function setPayrollRef(venue: Venue, staffId: string, ref: string) {
  await withTenant(venue.tenantId, async (tx) => {
    const r = await tx.update(t.staffUser).set({ payrollRef: String(ref ?? "").trim().slice(0, 30) }).where(and(eq(t.staffUser.id, staffId), eq(t.staffUser.venueId, venue.id))).returning();
    if (!r.length) throw new NotFound("Not found");
  });
}

export async function setSundayPremium(venue: Venue, pct: number) {
  if (!Number.isInteger(pct) || pct < 0 || pct > 100) throw new CartError("Sunday premium must be 0 to 100%");
  await withTenant(venue.tenantId, (tx) => tx.update(t.venue).set({ sundayPremiumPct: pct }).where(eq(t.venue.id, venue.id)));
}
