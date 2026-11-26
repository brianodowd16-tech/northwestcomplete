// Groups (friends across venues), their chat, sessions and parties at a venue, song
// requests, shared costs (group bills) and leaderboards. Groups belong to guests, not
// venues: every call checks the guest is a current member before reading or writing.
import {
  checkCustom, cleanGroupName, localDate, zonedToUtc, cleanLeaderboardName, cleanMessage, GroupError, inviteCode, rankRows, revolutLink, settleUp,
  splitByItems, splitEqual, spotifyLink, type ShareRow,
} from "@round/core";
import { and, asc, desc, eq, gte, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import { systemDb, withTenant } from "./index";
import { createBooking } from "./growth";
import * as t from "./schema";
import { Forbidden, NotFound, venueBySlug, type Customer, type Staff, type Venue } from "./services";

const db = () => systemDb();
/** Inside a group people see first names and an initial, never phone numbers or emails. */
export const shortName = (name: string) => { const p = name.trim().split(/\s+/); return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : p[0] || "Guest"; };

async function assertMember(groupId: string, customerId: string) {
  const [m] = await db().select().from(t.groupMember).where(and(eq(t.groupMember.groupId, groupId), eq(t.groupMember.customerId, customerId), isNull(t.groupMember.leftAt)));
  if (!m) throw new NotFound("Group not found");
  return m;
}

async function system(groupId: string, body: string, kind: "system" | "song" = "system") {
  await db().insert(t.groupMessage).values({ groupId, customerId: null, kind, body });
}

// ---------------------------------------------------------------- groups

export async function createGroup(c: Customer, name: string) {
  const [g] = await db().insert(t.guestGroup).values({ name: cleanGroupName(name), inviteCode: inviteCode(), createdBy: c.id }).returning();
  await db().insert(t.groupMember).values({ groupId: g.id, customerId: c.id, role: "owner" });
  await system(g.id, `${shortName(c.name)} started the group`);
  return g;
}

/** What someone sees before joining from an invite link: the name and member count only. */
export async function groupInvite(code: string) {
  const [g] = await db().select().from(t.guestGroup).where(eq(t.guestGroup.inviteCode, code));
  if (!g) return null;
  const members = await db().select({ id: t.groupMember.id }).from(t.groupMember).where(and(eq(t.groupMember.groupId, g.id), isNull(t.groupMember.leftAt)));
  return { id: g.id, name: g.name, members: members.length };
}

export async function joinGroup(c: Customer, code: string) {
  const [g] = await db().select().from(t.guestGroup).where(eq(t.guestGroup.inviteCode, code));
  if (!g) throw new NotFound("That invite link doesn't work any more");
  const active = await db().select({ id: t.groupMember.id }).from(t.groupMember).where(and(eq(t.groupMember.groupId, g.id), isNull(t.groupMember.leftAt)));
  if (active.length >= 50) throw new GroupError("This group is full (50 people)");
  const [existing] = await db().select().from(t.groupMember).where(and(eq(t.groupMember.groupId, g.id), eq(t.groupMember.customerId, c.id)));
  if (existing && !existing.leftAt) return g;
  if (existing) await db().update(t.groupMember).set({ leftAt: null, joinedAt: new Date() }).where(eq(t.groupMember.id, existing.id));
  else await db().insert(t.groupMember).values({ groupId: g.id, customerId: c.id });
  await system(g.id, `${shortName(c.name)} joined`);
  return g;
}

export async function leaveGroup(c: Customer, groupId: string) {
  const m = await assertMember(groupId, c.id);
  await db().update(t.groupMember).set({ leftAt: new Date() }).where(eq(t.groupMember.id, m.id));
  if (m.role === "owner") {
    const [next] = await db().select().from(t.groupMember).where(and(eq(t.groupMember.groupId, groupId), isNull(t.groupMember.leftAt))).orderBy(asc(t.groupMember.joinedAt)).limit(1);
    if (next) await db().update(t.groupMember).set({ role: "owner" }).where(eq(t.groupMember.id, next.id));
  }
  await system(groupId, `${shortName(c.name)} left`);
}

/** The group's owner can remove someone (and a new invite code stops old links working). */
export async function removeMember(owner: Customer, groupId: string, customerId: string) {
  const me = await assertMember(groupId, owner.id);
  if (me.role !== "owner") throw new Forbidden("Only the group's owner can remove people");
  if (customerId === owner.id) throw new GroupError("Use Leave group instead");
  const target = await assertMember(groupId, customerId);
  await db().update(t.groupMember).set({ leftAt: new Date() }).where(eq(t.groupMember.id, target.id));
  await db().update(t.guestGroup).set({ inviteCode: inviteCode() }).where(eq(t.guestGroup.id, groupId));
  await system(groupId, "Someone was removed from the group. The invite link has changed.");
}

export async function myGroups(customerId: string) {
  const rows = await db()
    .select({ g: t.guestGroup })
    .from(t.groupMember)
    .innerJoin(t.guestGroup, eq(t.guestGroup.id, t.groupMember.groupId))
    .where(and(eq(t.groupMember.customerId, customerId), isNull(t.groupMember.leftAt)));
  const out = [];
  for (const { g } of rows) {
    const [last] = await db().select().from(t.groupMessage).where(and(eq(t.groupMessage.groupId, g.id), isNull(t.groupMessage.hiddenAt))).orderBy(desc(t.groupMessage.createdAt)).limit(1);
    out.push({ id: g.id, name: g.name, last: last ? { body: last.body.slice(0, 80), at: last.createdAt } : null });
  }
  return out.sort((a, b) => (b.last?.at.getTime() ?? 0) - (a.last?.at.getTime() ?? 0));
}

export async function groupDetail(groupId: string, customerId: string) {
  const me = await assertMember(groupId, customerId);
  const [g] = await db().select().from(t.guestGroup).where(eq(t.guestGroup.id, groupId));
  const members = await db()
    .select({ id: t.customer.id, name: t.customer.name, role: t.groupMember.role, revolut: t.customer.revolutHandle })
    .from(t.groupMember)
    .innerJoin(t.customer, eq(t.customer.id, t.groupMember.customerId))
    .where(and(eq(t.groupMember.groupId, groupId), isNull(t.groupMember.leftAt)))
    .orderBy(asc(t.groupMember.joinedAt));
  return {
    id: g.id, name: g.name, inviteCode: g.inviteCode, playlistUrl: g.playlistUrl, myRole: me.role,
    members: members.map((m) => ({ id: m.id, name: shortName(m.name), role: m.role, revolutUrl: revolutLink(m.revolut), me: m.id === customerId })),
  };
}

export async function setPlaylist(c: Customer, groupId: string, url: string) {
  await assertMember(groupId, c.id);
  const link = url.trim() ? spotifyLink(url) : null;
  if (url.trim() && link?.kind !== "playlist") throw new GroupError("Paste a Spotify playlist link (open.spotify.com/playlist/…)");
  await db().update(t.guestGroup).set({ playlistUrl: link?.url ?? null }).where(eq(t.guestGroup.id, groupId));
  if (link) await system(groupId, `${shortName(c.name)} shared the group playlist: ${link.url}`, "song");
}

// ---------------------------------------------------------------- chat

export async function messages(groupId: string, customerId: string, since?: Date) {
  await assertMember(groupId, customerId);
  const rows = await db()
    .select({ m: t.groupMessage, name: t.customer.name })
    .from(t.groupMessage)
    .leftJoin(t.customer, eq(t.customer.id, t.groupMessage.customerId))
    .where(and(eq(t.groupMessage.groupId, groupId), isNull(t.groupMessage.hiddenAt), since ? gte(t.groupMessage.createdAt, since) : undefined))
    .orderBy(desc(t.groupMessage.createdAt))
    .limit(100);
  return rows.reverse().map(({ m, name }) => ({ id: m.id, kind: m.kind, body: m.body, at: m.createdAt, from: m.customerId ? shortName(name ?? "Guest") : null, mine: m.customerId === customerId }));
}

export async function postMessage(c: Customer, groupId: string, body: string) {
  await assertMember(groupId, c.id);
  const text = cleanMessage(body);
  const recent = await db().select({ id: t.groupMessage.id }).from(t.groupMessage).where(and(eq(t.groupMessage.customerId, c.id), gte(t.groupMessage.createdAt, new Date(Date.now() - 60_000))));
  if (recent.length >= 20) throw new GroupError("Slow down a little: 20 messages a minute at most");
  const [m] = await db().insert(t.groupMessage).values({ groupId, customerId: c.id, kind: /https:\/\/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?track\/[A-Za-z0-9]{10,}/.test(text) ? "song" : "text", body: text }).returning();
  return m;
}

/** Reporting hides the message for everyone and keeps it for review. */
export async function reportMessage(c: Customer, messageId: string) {
  const [m] = await db().select().from(t.groupMessage).where(eq(t.groupMessage.id, messageId));
  if (!m) throw new NotFound("Message not found");
  await assertMember(m.groupId, c.id);
  await db().update(t.groupMessage).set({ reportedAt: new Date(), hiddenAt: new Date() }).where(eq(t.groupMessage.id, messageId));
}

// ---------------------------------------------------------------- sessions and parties

/** A night out now (session) or a planned party, optionally booking a table for the group. */
export async function createSession(c: Customer, groupId: string, input: { venueSlug: string; kind: "session" | "party"; title?: string; startsAt?: Date; hours?: number; book?: number }) {
  await assertMember(groupId, c.id);
  const venue = await venueBySlug(input.venueSlug);
  if (venue.status === "suspended") throw new Forbidden(`${venue.name} isn't open on Complete`);
  const start = input.kind === "session" ? new Date() : input.startsAt;
  if (!start || Number.isNaN(start.getTime())) throw new GroupError("Pick a date and time");
  if (input.kind === "party" && start.getTime() < Date.now() - 60_000) throw new GroupError("Pick a time in the future");
  const hours = Math.min(12, Math.max(1, Number(input.hours) || (input.kind === "session" ? 4 : 5)));
  let bookingId: string | null = null;
  const title = String(input.title ?? "").trim().slice(0, 80) || (input.kind === "session" ? `Out at ${venue.name}` : `Party at ${venue.name}`);
  if (input.kind === "party" && input.book) bookingId = (await createBooking(venue, c, { startsAt: start, partySize: input.book, note: `Group: ${title}` })).id;
  const [s] = await db().insert(t.groupSession).values({ groupId, venueId: venue.id, kind: input.kind, title, startsAt: start, endsAt: new Date(start.getTime() + hours * 3_600_000), bookingId, createdBy: c.id }).returning();
  await db().insert(t.sessionRsvp).values({ sessionId: s.id, customerId: c.id, answer: "going" });
  await system(groupId, input.kind === "session" ? `${shortName(c.name)} is at ${venue.name}: orders from the group show together tonight` : `${shortName(c.name)} planned "${title}" at ${venue.name}, ${start.toLocaleString("en-IE", { timeZone: venue.timezone, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}${bookingId ? `, table for ${input.book} booked` : ""}. Going?`);
  return s;
}

export async function rsvp(c: Customer, sessionId: string, answer: "going" | "maybe" | "no") {
  const [s] = await db().select().from(t.groupSession).where(eq(t.groupSession.id, sessionId));
  if (!s || s.cancelledAt) throw new NotFound("Not found");
  await assertMember(s.groupId, c.id);
  await db().insert(t.sessionRsvp).values({ sessionId, customerId: c.id, answer }).onConflictDoUpdate({ target: [t.sessionRsvp.sessionId, t.sessionRsvp.customerId], set: { answer, updatedAt: new Date() } });
}

export async function cancelSession(c: Customer, sessionId: string) {
  const [s] = await db().select().from(t.groupSession).where(eq(t.groupSession.id, sessionId));
  if (!s) throw new NotFound("Not found");
  await assertMember(s.groupId, c.id);
  if (s.createdBy !== c.id) throw new Forbidden("Only the person who planned it can cancel it");
  await db().update(t.groupSession).set({ cancelledAt: new Date() }).where(eq(t.groupSession.id, sessionId));
  if (s.bookingId) {
    const [v] = await db().select().from(t.venue).where(eq(t.venue.id, s.venueId));
    await withTenant(v.tenantId, (tx) => tx.update(t.booking).set({ status: "cancelled" }).where(eq(t.booking.id, s.bookingId!)));
  }
  await system(s.groupId, `"${s.title}" was cancelled`);
}

/** The group's sessions: upcoming and today's, with who's going and (for today) the group's orders. */
export async function groupSessions(groupId: string, customerId: string) {
  await assertMember(groupId, customerId);
  const ss = await db()
    .select({ s: t.groupSession, venue: t.venue })
    .from(t.groupSession)
    .innerJoin(t.venue, eq(t.venue.id, t.groupSession.venueId))
    .where(and(eq(t.groupSession.groupId, groupId), isNull(t.groupSession.cancelledAt), gte(t.groupSession.endsAt, new Date(Date.now() - 12 * 3_600_000))))
    .orderBy(asc(t.groupSession.startsAt));
  const out = [];
  for (const { s, venue } of ss) {
    const answers = await db().select({ a: t.sessionRsvp, name: t.customer.name }).from(t.sessionRsvp).innerJoin(t.customer, eq(t.customer.id, t.sessionRsvp.customerId)).where(eq(t.sessionRsvp.sessionId, s.id));
    const orders = await withTenant(venue.tenantId, (tx) =>
      tx.select().from(t.orders).where(and(eq(t.orders.sessionId, s.id), inArray(t.orders.status, ["paid", "refunded"]))).orderBy(asc(t.orders.createdAt)),
    );
    const names = new Map((await db().select({ id: t.customer.id, name: t.customer.name }).from(t.customer).where(inArray(t.customer.id, [...new Set(orders.map((o) => o.customerId!).filter(Boolean)), "00000000-0000-0000-0000-000000000000"]))).map((r) => [r.id, shortName(r.name)]));
    const songs = await withTenant(venue.tenantId, (tx) => tx.select().from(t.songRequest).where(eq(t.songRequest.sessionId, s.id)).orderBy(desc(t.songRequest.createdAt)).limit(20));
    out.push({
      id: s.id, kind: s.kind, title: s.title, startsAt: s.startsAt, endsAt: s.endsAt, booked: !!s.bookingId, mine: s.createdBy === customerId,
      venue: { slug: venue.slug, name: venue.name, timezone: venue.timezone, songRequests: venue.songRequests },
      live: s.startsAt.getTime() - 3_600_000 <= Date.now() && Date.now() <= s.endsAt.getTime(),
      rsvps: answers.map(({ a, name }) => ({ name: shortName(name), answer: a.answer, me: a.customerId === customerId })),
      orders: orders.map((o) => ({ id: o.id, number: o.number, who: names.get(o.customerId ?? "") ?? "Guest", totalCents: o.amountPaidCents, status: o.status, mine: o.customerId === customerId })),
      songs: songs.map((x) => ({ title: x.title, link: x.link, status: x.status })),
    });
  }
  return out;
}

/** The session a guest is at right now at this venue (orders placed now join it). */
export async function liveSessionFor(customerId: string, venueId: string) {
  const now = new Date();
  const rows = await db()
    .select({ s: t.groupSession })
    .from(t.groupSession)
    .innerJoin(t.groupMember, and(eq(t.groupMember.groupId, t.groupSession.groupId), eq(t.groupMember.customerId, customerId), isNull(t.groupMember.leftAt)))
    .where(and(eq(t.groupSession.venueId, venueId), isNull(t.groupSession.cancelledAt), lt(t.groupSession.startsAt, new Date(now.getTime() + 3_600_000)), gte(t.groupSession.endsAt, now)))
    .orderBy(desc(t.groupSession.startsAt))
    .limit(1);
  return rows[0]?.s ?? null;
}

export async function tagOrderSession(venue: Venue, orderId: string, sessionId: string) {
  await withTenant(venue.tenantId, (tx) => tx.update(t.orders).set({ sessionId }).where(and(eq(t.orders.id, orderId), eq(t.orders.venueId, venue.id))));
}

// ---------------------------------------------------------------- song requests

/** A song for the venue to play (on its own licensed system). Three per person per 30 minutes. */
export async function requestSong(c: Customer, sessionId: string, input: { title: string; link?: string }) {
  const [s] = await db().select().from(t.groupSession).where(eq(t.groupSession.id, sessionId));
  if (!s || s.cancelledAt) throw new NotFound("Not found");
  await assertMember(s.groupId, c.id);
  const [venue] = await db().select().from(t.venue).where(eq(t.venue.id, s.venueId));
  if (!venue.songRequests) throw new Forbidden(`${venue.name} isn't taking song requests`);
  if (Date.now() < s.startsAt.getTime() - 3_600_000 || Date.now() > s.endsAt.getTime()) throw new GroupError("Song requests open when your group is there");
  const link = input.link?.trim() ? spotifyLink(input.link) : null;
  if (input.link?.trim() && link?.kind !== "track") throw new GroupError("Paste a Spotify song link, or just type the song");
  const title = String(input.title ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  if (title.length < 2) throw new GroupError("Which song?");
  const recent = await withTenant(venue.tenantId, (tx) => tx.select({ id: t.songRequest.id }).from(t.songRequest).where(and(eq(t.songRequest.customerId, c.id), gte(t.songRequest.createdAt, new Date(Date.now() - 30 * 60_000)))));
  if (recent.length >= 3) throw new GroupError("Three requests every half hour, so everyone gets a go");
  await withTenant(venue.tenantId, (tx) => tx.insert(t.songRequest).values({ tenantId: venue.tenantId, venueId: venue.id, sessionId, customerId: c.id, title, link: link?.url ?? null }));
  await system(s.groupId, `🎵 ${shortName(c.name)} asked ${venue.name} for "${title}"`, "song");
}

/** For the staff Music list: today's requests, newest first. */
export async function songRequests(staff: Staff) {
  const [v] = await db().select().from(t.venue).where(eq(t.venue.id, staff.venueId));
  return withTenant(v.tenantId, (tx) => tx.select().from(t.songRequest).where(and(eq(t.songRequest.venueId, v.id), gte(t.songRequest.createdAt, new Date(Date.now() - 12 * 3_600_000)))).orderBy(asc(t.songRequest.status), desc(t.songRequest.createdAt)).limit(100));
}

export async function setSongStatus(staff: Staff, id: string, status: "played" | "declined") {
  const [v] = await db().select().from(t.venue).where(eq(t.venue.id, staff.venueId));
  const r = await withTenant(v.tenantId, (tx) => tx.update(t.songRequest).set({ status }).where(and(eq(t.songRequest.id, id), eq(t.songRequest.venueId, v.id))).returning());
  if (!r.length) throw new NotFound("Not found");
}

// ---------------------------------------------------------------- shared costs

export interface SplitInput {
  title: string;
  method: "equal" | "items" | "custom";
  people: string[];
  orderId?: string;
  sessionId?: string;
  totalCents?: number;
  lines?: { name: string; cents: number; ticket?: boolean }[];
  claims?: Record<string, string[]>;
  amounts?: Record<string, number>;
}

/**
 * Splits something the guest paid (one of their app orders, or a custom bill such as
 * tickets) between group members. Money never moves through Complete: each person's
 * share is settled with the payer directly. The payer's own share counts as paid.
 */
export async function createSplit(c: Customer, groupId: string, input: SplitInput) {
  await assertMember(groupId, c.id);
  const people = [...new Set(input.people)];
  if (!people.includes(c.id)) people.unshift(c.id);
  const active = await db().select({ id: t.groupMember.customerId }).from(t.groupMember).where(and(eq(t.groupMember.groupId, groupId), isNull(t.groupMember.leftAt)));
  if (people.some((p) => !active.some((a) => a.id === p))) throw new GroupError("Everyone in the split must be in the group");
  if (people.length < 2) throw new GroupError("Choose at least one other person");
  let total: number, venueId: string | null = null, lines: { id: string; name: string; cents: number; ticket?: boolean }[] = [];
  if (input.orderId) {
    const [o] = await db().select().from(t.orders).where(eq(t.orders.id, input.orderId));
    if (!o || o.customerId !== c.id || o.status !== "paid") throw new NotFound("Choose one of your paid orders");
    const [v] = await db().select().from(t.venue).where(eq(t.venue.id, o.venueId));
    const ol = await withTenant(v.tenantId, (tx) => tx.select().from(t.orderLine).where(eq(t.orderLine.orderId, o.id)));
    total = o.amountPaidCents;
    venueId = o.venueId;
    lines = ol.map((l) => ({ id: l.id, name: `${l.qty} × ${l.name}`, cents: l.grossCents }));
    if (o.tipCents) lines.push({ id: "tip", name: "Tip", cents: o.tipCents });
    if (input.method === "items" && lines.reduce((s, l) => s + l.cents, 0) !== total) throw new GroupError("Loyalty credit paid part of this order: split it equally or by amounts");
  } else {
    lines = (input.lines ?? []).filter((l) => l.name?.trim() && Number.isInteger(l.cents) && l.cents > 0).map((l, i) => ({ id: `l${i}`, name: l.name.trim().slice(0, 60), cents: l.cents, ...(l.ticket ? { ticket: true } : {}) }));
    total = lines.length ? lines.reduce((s, l) => s + l.cents, 0) : Number(input.totalCents);
    if (!Number.isInteger(total) || total <= 0 || total > 1_000_000) throw new GroupError("Enter what it cost");
  }
  const title = String(input.title ?? "").trim().slice(0, 80) || "Shared bill";
  const amounts =
    input.method === "equal" ? Object.fromEntries(splitEqual(total, people.length).map((a, i) => [people[i], a]))
    : input.method === "items" ? splitByItems(lines, people, input.claims ?? {})
    : checkCustom(total, Object.fromEntries(people.map((p) => [p, Number(input.amounts?.[p] ?? 0)])));
  return db().transaction(async (tx) => {
    const [split] = await tx.insert(t.billSplit).values({ groupId, sessionId: input.sessionId ?? null, venueId, orderId: input.orderId ?? null, title, paidBy: c.id, totalCents: total, method: input.method, lines }).returning();
    await tx.insert(t.billShare).values(people.map((p) => ({ splitId: split.id, customerId: p, amountCents: amounts[p] ?? 0, lineIds: (input.claims?.[p] ?? []).filter((id) => lines.some((l) => l.id === id)), status: p === c.id ? ("paid" as const) : ("owed" as const), settledAt: p === c.id ? new Date() : null })));
    const each = new Set(Object.values(amounts)).size === 1 ? ` (€${(Object.values(amounts)[0] / 100).toFixed(2)} each)` : "";
    await tx.insert(t.groupMessage).values({ groupId, kind: "system", body: `💸 ${shortName(c.name)} split "${title}", €${(total / 100).toFixed(2)}, between ${people.length}${each}` });
    return split;
  });
}

async function shareWithSplit(shareId: string) {
  const [r] = await db().select({ share: t.billShare, split: t.billSplit }).from(t.billShare).innerJoin(t.billSplit, eq(t.billSplit.id, t.billShare.splitId)).where(eq(t.billShare.id, shareId));
  if (!r || r.split.cancelledAt) throw new NotFound("Not found");
  return r;
}

/** The person who owes says they've paid, or the payer confirms they got it. */
export async function markSharePaid(c: Customer, shareId: string) {
  const { share, split } = await shareWithSplit(shareId);
  await assertMember(split.groupId, c.id);
  if (c.id !== share.customerId && c.id !== split.paidBy) throw new Forbidden("Only the two people involved can settle this");
  await db().update(t.billShare).set({ status: "paid", settledAt: new Date() }).where(eq(t.billShare.id, shareId));
}

/** The payer covers someone's share ("this one's on me"). */
export async function coverShare(c: Customer, shareId: string) {
  const { share, split } = await shareWithSplit(shareId);
  if (c.id !== split.paidBy) throw new Forbidden("Only the person who paid can cover a share");
  if (share.status !== "owed") return;
  await db().update(t.billShare).set({ status: "covered", settledAt: new Date() }).where(eq(t.billShare.id, shareId));
  const [debtor] = await db().select({ name: t.customer.name }).from(t.customer).where(eq(t.customer.id, share.customerId));
  await system(split.groupId, `🎁 ${shortName(c.name)} covered ${shortName(debtor?.name ?? "someone")}'s share of "${split.title}"`);
}

/** A friendly nudge in the chat, at most once every 12 hours per share. */
export async function remindShare(c: Customer, shareId: string) {
  const { share, split } = await shareWithSplit(shareId);
  if (c.id !== split.paidBy) throw new Forbidden("Only the person who paid can send a reminder");
  if (share.status !== "owed") throw new GroupError("That's already settled");
  if (share.remindedAt && Date.now() - share.remindedAt.getTime() < 12 * 3_600_000) throw new GroupError("You sent a reminder in the last 12 hours");
  await db().update(t.billShare).set({ remindedAt: new Date() }).where(eq(t.billShare.id, shareId));
  const [debtor] = await db().select({ name: t.customer.name }).from(t.customer).where(eq(t.customer.id, share.customerId));
  await system(split.groupId, `🔔 ${shortName(debtor?.name ?? "Someone")}, your share of "${split.title}" is €${(share.amountCents / 100).toFixed(2)} to ${shortName(c.name)}`);
}

export async function cancelSplit(c: Customer, splitId: string) {
  const [split] = await db().select().from(t.billSplit).where(eq(t.billSplit.id, splitId));
  if (!split || split.paidBy !== c.id) throw new Forbidden("Only the person who paid can cancel this split");
  await db().update(t.billSplit).set({ cancelledAt: new Date() }).where(eq(t.billSplit.id, splitId));
  await system(split.groupId, `"${split.title}" split was cancelled`);
}

/** The group's bills, each person's shares, and who owes whom overall (fewest payments). */
export async function groupMoney(groupId: string, customerId: string) {
  await assertMember(groupId, customerId);
  const splits = await db().select().from(t.billSplit).where(and(eq(t.billSplit.groupId, groupId), isNull(t.billSplit.cancelledAt))).orderBy(desc(t.billSplit.createdAt)).limit(50);
  const shares = splits.length ? await db().select().from(t.billShare).where(inArray(t.billShare.splitId, splits.map((s) => s.id))) : [];
  const people = await db().select({ id: t.customer.id, name: t.customer.name, revolut: t.customer.revolutHandle }).from(t.customer).where(inArray(t.customer.id, [...new Set([...shares.map((s) => s.customerId), ...splits.map((s) => s.paidBy)]), "00000000-0000-0000-0000-000000000000"]));
  const who = new Map(people.map((p) => [p.id, { name: shortName(p.name), revolutUrl: revolutLink(p.revolut) }]));
  const rows: ShareRow[] = shares.map((s) => ({ payer: splits.find((x) => x.id === s.splitId)!.paidBy, debtor: s.customerId, cents: s.amountCents, status: s.status }));
  return {
    splits: splits.map((s) => ({
      id: s.id, title: s.title, totalCents: s.totalCents, method: s.method, lines: s.lines, at: s.createdAt, paidBy: who.get(s.paidBy)?.name ?? "Guest", mine: s.paidBy === customerId,
      shares: shares.filter((x) => x.splitId === s.id).map((x) => ({ id: x.id, name: who.get(x.customerId)?.name ?? "Guest", me: x.customerId === customerId, cents: x.amountCents, status: x.status, lines: x.lineIds })),
    })),
    settle: settleUp(rows).map((d) => ({ from: who.get(d.from)?.name ?? "Guest", to: who.get(d.to)?.name ?? "Guest", cents: d.cents, iOwe: d.from === customerId, owedToMe: d.to === customerId, payUrl: d.from === customerId ? who.get(d.to)?.revolutUrl ?? null : null })),
  };
}

/** The guest's own paid app orders from the last week, to split. */
export async function recentOrdersToSplit(customerId: string) {
  const rows = await db()
    .select({ o: t.orders, venue: t.venue.name })
    .from(t.orders)
    .innerJoin(t.venue, eq(t.venue.id, t.orders.venueId))
    .where(and(eq(t.orders.customerId, customerId), eq(t.orders.status, "paid"), gte(t.orders.createdAt, new Date(Date.now() - 7 * 86_400_000))))
    .orderBy(desc(t.orders.createdAt))
    .limit(10);
  const lines = rows.length ? await db().select().from(t.orderLine).where(inArray(t.orderLine.orderId, rows.map((r) => r.o.id))) : [];
  return rows.map(({ o, venue }) => {
    const ls = lines.filter((l) => l.orderId === o.id).map((l) => ({ id: l.id, name: `${l.qty} × ${l.name}`, cents: l.grossCents }));
    if (o.tipCents) ls.push({ id: "tip", name: "Tip", cents: o.tipCents });
    return { id: o.id, label: `#${o.number} at ${venue}, €${(o.amountPaidCents / 100).toFixed(2)}`, at: o.createdAt, lines: ls, byItem: ls.reduce((a, l) => a + l.cents, 0) === o.amountPaidCents };
  });
}

// ---------------------------------------------------------------- profile

export async function setGuestSocial(c: Customer, input: { leaderboardOptIn?: boolean; leaderboardName?: string; revolutHandle?: string }) {
  const set: Partial<typeof t.customer.$inferInsert> = {};
  if (input.leaderboardOptIn !== undefined) {
    set.leaderboardOptIn = !!input.leaderboardOptIn;
    if (input.leaderboardOptIn) set.leaderboardName = cleanLeaderboardName(input.leaderboardName || c.leaderboardName || c.name.split(" ")[0]);
  } else if (input.leaderboardName !== undefined) set.leaderboardName = cleanLeaderboardName(input.leaderboardName);
  if (input.revolutHandle !== undefined) {
    const h = input.revolutHandle.trim();
    if (h && !revolutLink(h)) throw new GroupError("That doesn't look like a Revolut handle (revolut.me/yourname)");
    set.revolutHandle = h ? h.replace(/^@/, "").replace(/^https:\/\/revolut\.me\//, "") : null;
  }
  await db().update(t.customer).set(set).where(eq(t.customer.id, c.id));
}

// ---------------------------------------------------------------- leaderboards

export type BoardScope = { kind: "venue"; slug: string } | { kind: "county"; county: string } | { kind: "country"; country: string };

/**
 * Most points, or most spend on non-alcohol items (Irish law: no status for buying
 * alcohol), at one venue, across a county or a country; this month or all time. Only
 * guests who opted in appear, under their display name. The viewer sees their own
 * position even if they haven't opted in.
 */
export async function leaderboard(scope: BoardScope, metric: "points" | "spend", period: "month" | "all", viewerId?: string) {
  const venues = await db().select({ id: t.venue.id }).from(t.venue).where(
    scope.kind === "venue" ? eq(t.venue.slug, scope.slug) : scope.kind === "county" ? and(eq(t.venue.county, scope.county), eq(t.venue.status, "live")) : and(eq(t.venue.country, scope.country), eq(t.venue.status, "live")),
  );
  if (!venues.length) return { rows: [], me: null };
  const ids = venues.map((v) => v.id);
  const now = new Date();
  // "This month" starts at midnight Irish time on the 1st.
  const since = period === "month" ? zonedToUtc(`${localDate(now, "Europe/Dublin").slice(0, 8)}01T00:00`, "Europe/Dublin") : new Date(0);
  const scores =
    metric === "spend"
      ? await db()
          .select({ customerId: t.orders.customerId, score: sql<number>`sum(${t.orders.rewardableCents})::int` })
          .from(t.orders)
          .where(and(inArray(t.orders.venueId, ids), eq(t.orders.status, "paid"), gte(t.orders.paidAt, since), ne(t.orders.channel, "counter")))
          .groupBy(t.orders.customerId)
      : await db()
          .select({ customerId: t.orders.customerId, score: sql<number>`sum(${t.loyaltyLedger.delta})::int` })
          .from(t.loyaltyLedger)
          .innerJoin(t.orders, eq(t.orders.id, t.loyaltyLedger.orderId))
          .where(and(inArray(t.orders.venueId, ids), eq(t.loyaltyLedger.kind, "points"), gte(t.loyaltyLedger.createdAt, since)))
          .groupBy(t.orders.customerId);
  const cust = scores.length ? await db().select({ id: t.customer.id, optIn: t.customer.leaderboardOptIn, name: t.customer.leaderboardName, deleted: t.customer.deletedAt }).from(t.customer).where(inArray(t.customer.id, scores.map((s) => s.customerId!).filter(Boolean))) : [];
  const byId = new Map(cust.map((c) => [c.id, c]));
  const eligible = scores.filter((s) => s.customerId && byId.get(s.customerId)?.optIn && !byId.get(s.customerId)?.deleted && Number(s.score) > 0);
  const ranked = rankRows(eligible.map((s) => ({ id: s.customerId!, name: byId.get(s.customerId!)!.name || "Guest", score: Number(s.score) })));
  let me = null;
  if (viewerId) {
    const mine = Number(scores.find((s) => s.customerId === viewerId)?.score ?? 0);
    if (mine > 0) me = { rank: eligible.filter((s) => Number(s.score) > mine && s.customerId !== viewerId).length + 1, score: mine, listed: !!byId.get(viewerId)?.optIn };
  }
  return { rows: ranked.map((r) => ({ rank: r.rank, tied: r.tied, name: r.name, score: r.score, me: r.id === viewerId })), me };
}

/** Counties that have live venues (for the leaderboard picker). */
export async function liveCounties() {
  const rows = await db().selectDistinct({ county: t.venue.county, country: t.venue.country }).from(t.venue).where(eq(t.venue.status, "live"));
  return rows.filter((r) => r.county) as { county: string; country: string }[];
}

export async function saveVenueCommunity(venue: Venue, input: { county?: string | null; shareNetwork?: boolean; songRequests?: boolean }) {
  await withTenant(venue.tenantId, (tx) =>
    tx.update(t.venue).set({ ...(input.county !== undefined ? { county: input.county || null } : {}), ...(input.shareNetwork !== undefined ? { shareNetwork: input.shareNetwork } : {}), ...(input.songRequests !== undefined ? { songRequests: input.songRequests } : {}) }).where(eq(t.venue.id, venue.id)),
  );
}
