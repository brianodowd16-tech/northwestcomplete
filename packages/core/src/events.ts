// What's on: live music, TV sport, quizzes and other events at a venue.

export class EventError extends Error {}

export const EVENT_KINDS = {
  music: { label: "Live music", icon: "🎵" },
  sport: { label: "Sport on TV", icon: "📺" },
  quiz: { label: "Quiz", icon: "❓" },
  comedy: { label: "Comedy", icon: "🎤" },
  other: { label: "Event", icon: "📅" },
} as const;
export type EventKind = keyof typeof EVENT_KINDS;

export interface EventInput {
  kind: string;
  title: string;
  details?: string;
  where?: string;
  /** Local date and time at the venue, "2026-11-28T20:00". */
  startsLocal: string;
  durationMins?: number;
  repeatWeekly?: boolean;
  repeatUntil?: string | null;
  coverCents?: number;
}

/** Offset of `tz` from UTC at instant `utcMs`, in ms. */
function tzOffset(utcMs: number, tz: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(utcMs))
      .map((x) => [x.type, x.value]),
  );
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(utcMs / 1000) * 1000;
}

/** "2026-11-28T20:00" at the venue → the UTC instant. */
export function zonedToUtc(local: string, tz: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) throw new EventError("Enter a date and time");
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  const first = guess - tzOffset(guess, tz);
  return new Date(guess - tzOffset(first, tz));
}

/** The UTC instant → "2026-11-28T20:00" at the venue. */
export function utcToZoned(d: Date, tz: string): string {
  const shifted = new Date(d.getTime() + tzOffset(d.getTime(), tz));
  return shifted.toISOString().slice(0, 16);
}

export function validateEvent(input: EventInput, tz: string) {
  if (!(input.kind in EVENT_KINDS)) throw new EventError("Choose what kind of event it is");
  const title = String(input.title ?? "").trim().replace(/\s+/g, " ");
  if (title.length < 2 || title.length > 100) throw new EventError("Give the event a name");
  const durationMins = Number(input.durationMins ?? 120);
  if (!Number.isInteger(durationMins) || durationMins < 15 || durationMins > 24 * 60) throw new EventError("Length must be between 15 minutes and 24 hours");
  const coverCents = Number(input.coverCents ?? 0);
  if (!Number.isInteger(coverCents) || coverCents < 0 || coverCents > 100_000) throw new EventError("Enter a valid entry price");
  const startsAt = zonedToUtc(String(input.startsLocal ?? ""), tz);
  const repeatUntil = input.repeatWeekly && input.repeatUntil ? String(input.repeatUntil) : null;
  if (repeatUntil && !/^\d{4}-\d{2}-\d{2}$/.test(repeatUntil)) throw new EventError("Enter the last date it repeats");
  return {
    kind: input.kind as EventKind,
    title,
    details: String(input.details ?? "").trim().slice(0, 300),
    where: String(input.where ?? "").trim().slice(0, 80),
    startsAt,
    durationMins,
    repeatWeekly: !!input.repeatWeekly,
    repeatUntil,
    coverCents,
  };
}

export interface StoredEvent {
  id: string;
  kind: EventKind;
  title: string;
  details: string;
  where: string;
  startsAt: Date;
  durationMins: number;
  repeatWeekly: boolean;
  repeatUntil: string | null;
  coverCents: number;
}
export interface Occurrence extends StoredEvent {
  key: string;
  start: Date;
  end: Date;
}

/**
 * Every occurrence overlapping [from, to). Weekly events keep their local time across
 * the clocks changing (8pm stays 8pm).
 */
export function occurrences(events: StoredEvent[], from: Date, to: Date, tz: string): Occurrence[] {
  const out: Occurrence[] = [];
  for (const e of events) {
    const dur = e.durationMins * 60_000;
    const push = (start: Date, i: number) => {
      const end = new Date(start.getTime() + dur);
      if (end > from && start < to) out.push({ ...e, key: `${e.id}:${i}`, start, end });
    };
    if (!e.repeatWeekly) {
      push(e.startsAt, 0);
      continue;
    }
    const local = utcToZoned(e.startsAt, tz);
    const [date, time] = local.split("T");
    const base = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10));
    const until = e.repeatUntil ? Date.UTC(+e.repeatUntil.slice(0, 4), +e.repeatUntil.slice(5, 7) - 1, +e.repeatUntil.slice(8, 10)) : Infinity;
    // Jump close to `from` instead of walking from the first week.
    const skip = Math.max(0, Math.floor((from.getTime() - dur - e.startsAt.getTime()) / (7 * 86_400_000)) - 1);
    for (let i = skip; i < skip + 520; i++) {
      const day = base + i * 7 * 86_400_000;
      if (day > until) break;
      const start = zonedToUtc(`${new Date(day).toISOString().slice(0, 10)}T${time}`, tz);
      if (start >= to) break;
      push(start, i);
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const icsTime = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
/** Lines over 75 octets are folded, as the iCalendar format requires. */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > (parts.length ? 74 : 75)) {
      parts.push(cur);
      cur = "";
    }
    cur += ch;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

/** An iCalendar file guests can add to their phone's calendar (or subscribe to). */
export function toIcs(calName: string, occ: Occurrence[], opts: { url: string; location: string; host: string }): string {
  const now = icsTime(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Complete//What's on//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsText(calName)}`,
    ...occ.flatMap((o) => [
      "BEGIN:VEVENT",
      `UID:${o.key.replace(":", "-")}@${opts.host}`,
      `DTSTAMP:${now}`,
      `DTSTART:${icsTime(o.start)}`,
      `DTEND:${icsTime(o.end)}`,
      `SUMMARY:${icsText(`${EVENT_KINDS[o.kind].icon} ${o.title}`)}`,
      `DESCRIPTION:${icsText([o.details, o.where && `Where: ${o.where}`, o.coverCents ? `Entry €${(o.coverCents / 100).toFixed(2)}` : "Free in"].filter(Boolean).join("\n"))}`,
      `LOCATION:${icsText(opts.location)}`,
      `URL:${opts.url}`,
      "END:VEVENT",
    ]),
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
