// Facts for the manager's home screen: today against the same time last week, the last 7
// days against the 7 before, tonight's bookings, who's on, and what needs attention.
import { buildBriefing, localDate, zonedToUtc, type BriefingFacts } from "@round/core";
import { and, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import { withTenant } from "./index";
import { stockLevels } from "./inventory";
import { openAlerts } from "./platform";
import * as t from "./schema";
import { type Staff, type Venue } from "./services";
import { venuePosts } from "./social";

const DAY = 86_400_000;

export async function briefingFacts(venue: Venue, staff: Staff, now = new Date()): Promise<BriefingFacts> {
  const tz = venue.timezone;
  const today = localDate(now, tz);
  const dayStart = zonedToUtc(`${today}T00:00`, tz);
  const weekStart = new Date(dayStart.getTime() - 6 * DAY); // the last 7 days including today
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hour12: false }).format(now)) % 24;
  const weekday = new Intl.DateTimeFormat("en-IE", { timeZone: tz, weekday: "long" }).format(now);

  const data = await withTenant(venue.tenantId, async (tx) => {
    const orders = await tx
      .select()
      .from(t.orders)
      .where(and(eq(t.orders.venueId, venue.id), inArray(t.orders.status, ["paid", "refunded"]), gte(t.orders.paidAt, new Date(weekStart.getTime() - 7 * DAY))));
    const ids = orders.filter((o) => o.status === "paid" && o.paidAt! >= weekStart).map((o) => o.id);
    const lines = ids.length ? await tx.select({ orderId: t.orderLine.orderId, name: t.orderLine.name, qty: t.orderLine.qty }).from(t.orderLine).where(inArray(t.orderLine.orderId, ids)) : [];
    const bookings = await tx.select().from(t.booking).where(and(eq(t.booking.venueId, venue.id), eq(t.booking.status, "confirmed"), gte(t.booking.startsAt, now), lt(t.booking.startsAt, new Date(dayStart.getTime() + DAY + 4 * 3_600_000))));
    const on = await tx.select({ name: t.staffUser.name }).from(t.staffShift).innerJoin(t.staffUser, eq(t.staffUser.id, t.staffShift.staffId)).where(and(eq(t.staffShift.venueId, venue.id), isNull(t.staffShift.clockOut)));
    const rota = await tx.select({ id: t.rotaShift.id }).from(t.rotaShift).where(and(eq(t.rotaShift.venueId, venue.id), eq(t.rotaShift.published, true), gte(t.rotaShift.startsAt, dayStart), lt(t.rotaShift.startsAt, new Date(dayStart.getTime() + DAY))));
    const songs = await tx.select({ id: t.songRequest.id }).from(t.songRequest).where(and(eq(t.songRequest.venueId, venue.id), eq(t.songRequest.status, "requested"), gte(t.songRequest.createdAt, new Date(now.getTime() - 12 * 3_600_000))));
    return { orders, lines, bookings, on, rota, songs };
  });

  const paid = data.orders.filter((o) => o.status === "paid");
  const sum = (os: typeof paid) => os.reduce((s, o) => s + o.grossCents, 0);
  const between = (from: Date, to: Date) => paid.filter((o) => o.paidAt! >= from && o.paidAt! < to);
  const todays = between(dayStart, now);
  const lastWeekSameTime = between(new Date(dayStart.getTime() - 7 * DAY), new Date(now.getTime() - 7 * DAY));
  const week = between(weekStart, now);
  const prevWeek = between(new Date(weekStart.getTime() - 7 * DAY), weekStart);
  const top = (orderIds: Set<string>) => {
    const m = new Map<string, number>();
    for (const l of data.lines) if (orderIds.has(l.orderId)) m.set(l.name, (m.get(l.name) ?? 0) + l.qty);
    const [name, qty] = [...m].sort((a, b) => b[1] - a[1])[0] ?? [];
    return name ? { name, qty: qty! } : null;
  };
  const byDay = new Map<string, number>();
  for (const o of week) byDay.set(localDate(o.paidAt!, tz), (byDay.get(localDate(o.paidAt!, tz)) ?? 0) + o.grossCents);
  const [bestDate, bestCents] = [...byDay].sort((a, b) => b[1] - a[1])[0] ?? [];
  const refundsToday = data.orders.filter((o) => o.refundedAt && o.refundedAt >= dayStart).reduce((s, o) => s + o.refundedCents, 0);
  const tonight = data.bookings.filter((b) => b.startsAt < new Date(dayStart.getTime() + DAY + 4 * 3_600_000));
  const [stock, alerts, posts] = await Promise.all([stockLevels(venue), openAlerts(venue), venuePosts(venue)]);
  return {
    venue: venue.name,
    firstName: staff.name.split(" ")[0],
    hour,
    weekday,
    slug: venue.slug,
    today: { salesCents: sum(todays), orders: todays.length, sameTimeLastWeekCents: sum(lastWeekSameTime), refundsCents: refundsToday, topItem: top(new Set(todays.map((o) => o.id))) },
    week: {
      salesCents: sum(week), orders: week.length, previousCents: sum(prevWeek), topItem: top(new Set(week.map((o) => o.id))),
      bestDay: bestDate ? { day: new Date(`${bestDate}T12:00:00Z`).toLocaleDateString("en-IE", { weekday: "long" }), salesCents: bestCents! } : null,
    },
    bookingsTonight: { count: tonight.length, covers: tonight.reduce((s, b) => s + b.partySize, 0), next: tonight[0] ? tonight[0].startsAt.toLocaleTimeString("en-IE", { timeZone: tz, hour: "2-digit", minute: "2-digit" }) : null },
    staffOn: data.on.map((s) => s.name.split(" ")[0]),
    rotaToday: data.rota.length,
    lowStock: stock.items.filter((i) => i.low).map((i) => i.name),
    alerts: alerts.map((a) => ({ title: a.title, href: a.href, severity: a.severity })),
    socialToApprove: posts.filter((p) => p.status === "draft").length,
    songsWaiting: data.songs.length,
  };
}

export async function managerBriefing(venue: Venue, staff: Staff, now = new Date()) {
  const facts = await briefingFacts(venue, staff, now);
  return { facts, briefing: buildBriefing(facts) };
}
