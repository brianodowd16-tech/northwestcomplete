// Running the venue: demand forecast, staff rota, price suggestions, payroll and funding estimates.
import { createHmac, timingSafeEqual } from "node:crypto";

const hourKey = (d: Date, tz: string) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.weekday}-${Number(p.hour)}`;
};

/**
 * Expected orders and sales for each hour of the coming days: the average of the same weekday and
 * hour over the past `weeks`, lifted for big games and events (people come in to watch).
 */
export function forecast(
  history: { at: Date; cents: number }[],
  opts: { from: Date; days: number; weeks: number; tz: string; events?: { start: Date; end: Date; lift: number }[] },
) {
  const sums = new Map<string, { orders: number; cents: number }>();
  for (const h of history) {
    const k = hourKey(h.at, opts.tz);
    const cur = sums.get(k) ?? { orders: 0, cents: 0 };
    sums.set(k, { orders: cur.orders + 1, cents: cur.cents + h.cents });
  }
  const out: { at: Date; orders: number; cents: number; lift: number }[] = [];
  const start = new Date(Math.floor(opts.from.getTime() / 3_600_000) * 3_600_000);
  for (let i = 0; i < opts.days * 24; i++) {
    const at = new Date(start.getTime() + i * 3_600_000);
    const base = sums.get(hourKey(at, opts.tz)) ?? { orders: 0, cents: 0 };
    const lift = Math.max(1, ...(opts.events ?? []).filter((e) => e.start.getTime() - 3_600_000 <= at.getTime() && e.end > at).map((e) => e.lift));
    out.push({ at, orders: Math.round((base.orders / opts.weeks) * lift * 10) / 10, cents: Math.round((base.cents / opts.weeks) * lift), lift });
  }
  return out;
}

/** Staff needed for an hour: one person per `perStaff` orders an hour, at least `min` while open. */
export function staffNeeded(orders: number, perStaff = 18, min = 1): number {
  return Math.max(min, Math.ceil(orders / perStaff));
}

/**
 * Price ideas a manager can approve: popular items with low margins can take a small rise
 * (never more than `maxPct`, rounded to 10c); slow, low-margin items are flagged for a rethink.
 */
export function priceSuggestions(items: { id: string; name: string; priceCents: number; gpPct: number; class: string; hasRecipe: boolean }[], opts: { targetGpPct?: number; maxPct?: number } = {}) {
  const target = opts.targetGpPct ?? 70, maxPct = opts.maxPct ?? 8;
  type Suggestion = { id: string; name: string; kind: "raise" | "review" | "promote"; fromCents: number; toCents: number; why: string };
  return items
    .filter((i) => i.hasRecipe)
    .flatMap((i): Suggestion[] => {
      if (i.class === "plowhorse" && i.gpPct < target) {
        const raw = Math.ceil((i.priceCents * (1 + maxPct / 100)) / 10) * 10;
        const capped = Math.min(raw, Math.floor((i.priceCents * (1 + maxPct / 100)) / 10) * 10);
        const newPrice = Math.max(i.priceCents + 10, capped);
        return [{ id: i.id, name: i.name, kind: "raise", fromCents: i.priceCents, toCents: newPrice, why: `Popular, but only ${i.gpPct}% profit. A small rise is unlikely to cut sales.` }];
      }
      if (i.class === "dog") return [{ id: i.id, name: i.name, kind: "review", fromCents: i.priceCents, toCents: i.priceCents, why: "Rarely ordered and low profit: rework the recipe, promote it, or drop it." }];
      if (i.class === "puzzle") return [{ id: i.id, name: i.name, kind: "promote", fromCents: i.priceCents, toCents: i.priceCents, why: `Good profit (${i.gpPct}%) but not many orders: feature it on the menu or as a special.` }];
      return [];
    });
}

/** Hours worked (to the quarter hour) and gross pay, per person, for payroll. */
export function payroll(shifts: { staffId: string; name: string; email: string; clockIn: Date; clockOut: Date | null; hourlyRateCents: number }[], until: Date) {
  const by = new Map<string, { name: string; email: string; minutes: number; grossCents: number; shifts: number }>();
  for (const s of shifts) {
    const end = s.clockOut ?? until;
    const mins = Math.max(0, Math.round((end.getTime() - s.clockIn.getTime()) / 900_000) * 15);
    const cur = by.get(s.staffId) ?? { name: s.name, email: s.email, minutes: 0, grossCents: 0, shifts: 0 };
    by.set(s.staffId, { ...cur, minutes: cur.minutes + mins, grossCents: cur.grossCents + Math.round((mins / 60) * s.hourlyRateCents), shifts: cur.shifts + 1 });
  }
  return [...by.values()].map((r) => ({ ...r, hours: r.minutes / 60 }));
}

/**
 * An indicative cash advance from card takings (the offer itself comes from a licensed lending partner):
 * about one month of card sales, repaid as a share of future card takings.
 */
export function fundingEstimate(cardCents90d: number) {
  const monthly = Math.round(cardCents90d / 3);
  const eligible = monthly >= 500_000; // €5,000 a month in card sales
  const advanceCents = eligible ? Math.min(25_000_000, Math.floor(monthly / 10_000) * 10_000) : 0;
  const holdbackPct = 10;
  const days = eligible ? Math.ceil((advanceCents * 1.1) / ((monthly / 30) * (holdbackPct / 100))) : 0;
  return { monthlyCardCents: monthly, eligible, advanceCents, holdbackPct, estimatedDays: days };
}

/** HMAC-SHA256 signature check for inbound webhooks (hex), in constant time. */
export function verifySignature(rawBody: string, secret: string, signature: string | null): boolean {
  if (!signature || !secret) return false;
  const want = createHmac("sha256", secret).update(rawBody).digest("hex");
  const got = signature.replace(/^sha256=/, "").trim().toLowerCase();
  return want.length === got.length && timingSafeEqual(Buffer.from(want), Buffer.from(got));
}
export const signBody = (rawBody: string, secret: string) => createHmac("sha256", secret).update(rawBody).digest("hex");

/** Bookable seats left in a 30-minute slot. */
export function seatsLeft(capacity: number, bookings: { partySize: number; startsAt: Date; status: string }[], slot: Date, stayMins = 120): number {
  const s = slot.getTime(), e = s + 30 * 60_000;
  const taken = bookings.filter((b) => b.status !== "cancelled" && b.status !== "no_show" && b.startsAt.getTime() < e && b.startsAt.getTime() + stayMins * 60_000 > s).reduce((a, b) => a + b.partySize, 0);
  return Math.max(0, capacity - taken);
}
