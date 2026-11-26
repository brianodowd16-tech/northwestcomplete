// The manager's home screen: the day and the week in a few plain sentences, plus the
// handful of things that need them. Built from facts only, so it reads the same with or
// without the AI assistant (which can then put it in its own words and answer questions).
import { formatEur as exact } from "./money";

/** Easy to read aloud: whole euros with thousands separators from €100 up ("€1,240"), exact below. */
const formatEur = (c: number) => (Math.abs(c) >= 10_000 ? `€${Math.round(c / 100).toLocaleString("en-IE")}` : exact(c));

export interface BriefingFacts {
  venue: string;
  firstName: string;
  hour: number; // venue-local hour now
  weekday: string; // e.g. "Tuesday"
  today: { salesCents: number; orders: number; sameTimeLastWeekCents: number; refundsCents: number; topItem: { name: string; qty: number } | null };
  week: { salesCents: number; orders: number; previousCents: number; topItem: { name: string; qty: number } | null; bestDay: { day: string; salesCents: number } | null };
  bookingsTonight: { count: number; covers: number; next: string | null };
  staffOn: string[];
  rotaToday: number;
  lowStock: string[];
  alerts: { title: string; href: string; severity: "warn" | "error" }[];
  socialToApprove: number;
  songsWaiting: number;
  slug: string;
}

export interface Briefing {
  greeting: string;
  today: string[];
  week: string[];
  attention: { text: string; href: string; tone: "error" | "warn" | "info" }[];
}

const pct = (now: number, before: number) => (before > 0 ? Math.round(((now - before) / before) * 100) : null);
const change = (now: number, before: number, against: string) => {
  const p = pct(now, before);
  if (p === null) return now > 0 ? "" : "";
  if (Math.abs(p) < 3) return `, about the same as ${against}`;
  return p > 0 ? `, up ${p}% on ${against}` : `, down ${-p}% on ${against}`;
};
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

export function buildBriefing(f: BriefingFacts): Briefing {
  const greeting = `${f.hour < 12 ? "Good morning" : f.hour < 18 ? "Good afternoon" : "Good evening"}, ${f.firstName}`;
  const today: string[] = [];
  if (f.today.orders === 0) today.push(f.today.sameTimeLastWeekCents > 0 ? `No sales yet today; by now last ${f.weekday} you'd taken ${formatEur(f.today.sameTimeLastWeekCents)}.` : "No sales yet today.");
  else today.push(`So far today: ${formatEur(f.today.salesCents)} from ${f.today.orders} ${f.today.orders === 1 ? "order" : "orders"}${change(f.today.salesCents, f.today.sameTimeLastWeekCents, `last ${f.weekday} at this time`)}.`);
  if (f.today.topItem) today.push(`Best seller today: ${f.today.topItem.name} (${f.today.topItem.qty}).`);
  if (f.bookingsTonight.count) today.push(`${f.bookingsTonight.count} ${f.bookingsTonight.count === 1 ? "booking" : "bookings"} still to come today (${f.bookingsTonight.covers} people)${f.bookingsTonight.next ? `, next at ${f.bookingsTonight.next}` : ""}.`);
  today.push(f.staffOn.length ? `On shift now: ${list(f.staffOn)}.` : f.rotaToday ? `${f.rotaToday} ${f.rotaToday === 1 ? "person is" : "people are"} rostered today; nobody is clocked in yet.` : "Nobody is clocked in right now.");
  if (f.today.refundsCents > 0) today.push(`${formatEur(f.today.refundsCents)} refunded today.`);

  const week: string[] = [];
  if (f.week.orders === 0) week.push("No sales in the last 7 days yet.");
  else {
    week.push(`Last 7 days: ${formatEur(f.week.salesCents)} from ${f.week.orders} orders${change(f.week.salesCents, f.week.previousCents, "the week before")}.`);
    if (f.week.bestDay) week.push(`Busiest day: ${f.week.bestDay.day} (${formatEur(f.week.bestDay.salesCents)}).`);
    if (f.week.topItem) week.push(`Best seller: ${f.week.topItem.name} (${f.week.topItem.qty} sold).`);
  }

  const attention: Briefing["attention"] = [
    ...f.alerts.map((a) => ({ text: a.title, href: a.href, tone: a.severity })),
    ...(f.lowStock.length ? [{ text: `Running low: ${list(f.lowStock.slice(0, 3))}${f.lowStock.length > 3 ? ` and ${f.lowStock.length - 3} more` : ""}`, href: `/office/${f.slug}/stock`, tone: "warn" as const }] : []),
    ...(f.socialToApprove ? [{ text: `${f.socialToApprove} social ${f.socialToApprove === 1 ? "post waits" : "posts wait"} for your OK`, href: `/office/${f.slug}/social`, tone: "info" as const }] : []),
    ...(f.songsWaiting ? [{ text: `${f.songsWaiting} song ${f.songsWaiting === 1 ? "request" : "requests"} waiting`, href: `/staff/${f.slug}/music`, tone: "info" as const }] : []),
  ];
  return { greeting, today, week, attention };
}
