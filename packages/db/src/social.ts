// Social media automation: each venue's rules, connected accounts (Facebook Page with its
// Instagram account, Google Business Profile), posts planned from its own data, and the
// queue the posting job works through. Complete's own network posts (county round-ups of
// venues that opted in) have no venue.
import {
  DEFAULT_SOCIAL_RULES, zonedToUtc, eventPost, gamesPost, localDate, networkPost, newItemPost, weeklyPost,
  type DraftPost, type SocialChannel, type SocialRules,
} from "@round/core";
import { and, asc, desc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { whatsOn } from "./events";
import { systemDb, withTenant } from "./index";
import { loadIntegration, saveIntegration } from "./integrations";
import * as t from "./schema";
import { NotFound, type Venue } from "./services";

export async function socialRules(venue: Venue): Promise<SocialRules> {
  const row = await loadIntegration(venue, "social");
  return { ...DEFAULT_SOCIAL_RULES, ...((row?.config ?? {}) as Partial<SocialRules>) };
}

export async function saveSocialRules(venue: Venue, input: Partial<SocialRules>, secretsKey: string) {
  const r = { ...(await socialRules(venue)), ...input };
  r.eventHoursBefore = Math.min(72, Math.max(1, Math.round(Number(r.eventHoursBefore) || 6)));
  await saveIntegration(venue, "social", r as unknown as Record<string, unknown>, null, secretsKey);
}

/** Which channels the venue can post to right now. */
export async function socialChannels(venue: Venue): Promise<{ channels: SocialChannel[]; meta: Record<string, string> | null; google: Record<string, string> | null }> {
  const [meta, google] = await Promise.all([loadIntegration(venue, "meta"), loadIntegration(venue, "google_business")]);
  const mc = meta?.secretEnc ? (meta.config as Record<string, string>) : null;
  const gc = google?.secretEnc ? (google.config as Record<string, string>) : null;
  const channels: SocialChannel[] = [];
  if (mc?.pageId) channels.push("facebook");
  if (mc?.igUserId) channels.push("instagram");
  if (gc?.location) channels.push("google");
  return { channels, meta: mc, google: gc };
}

/** Stores the chosen Facebook Page (and its Instagram account) with the Page token, encrypted. */
export async function connectMeta(venue: Venue, page: { pageId: string; pageName: string; igUserId?: string | null; igUsername?: string | null }, pageToken: string, secretsKey: string) {
  await saveIntegration(venue, "meta", { pageId: page.pageId, pageName: page.pageName, igUserId: page.igUserId ?? "", igUsername: page.igUsername ?? "" }, pageToken, secretsKey);
}

export async function connectGoogleBusiness(venue: Venue, location: { location: string; title: string }, refreshToken: string, secretsKey: string) {
  await saveIntegration(venue, "google_business", location, refreshToken, secretsKey);
}

export async function disconnectSocial(venue: Venue, kind: "meta" | "google_business") {
  await withTenant(venue.tenantId, (tx) => tx.delete(t.venueIntegration).where(and(eq(t.venueIntegration.venueId, venue.id), eq(t.venueIntegration.kind, kind))));
}

async function insertDraft(venue: Venue | null, d: DraftPost, channels: SocialChannel[], autoPublish: boolean, collaborators: string[] = []) {
  if (!channels.length) return false;
  const r = await systemDb()
    .insert(t.socialPost)
    .values({
      tenantId: venue?.tenantId ?? null, venueId: venue?.id ?? null, sourceKey: d.sourceKey, channels, text: d.text, link: d.link, collaborators,
      imageTitle: d.imageTitle, imageSubtitle: d.imageSubtitle, scheduledFor: d.scheduledFor, status: autoPublish && !d.needsApproval ? "approved" : "draft",
    })
    .onConflictDoNothing()
    .returning({ id: t.socialPost.id });
  return r.length > 0;
}

const mondayOf = (date: string) => { const d = new Date(`${date}T12:00:00Z`); return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10); };
const localAt = (date: string, hhmm: string, tz: string) => zonedToUtc(`${date}T${hhmm}`, tz);

/**
 * Plans the venue's next posts from its own data: each event (and events it co-hosts with
 * another venue) some hours before, today's games at 11:00, the week ahead on Mondays at
 * 10:00, and new food at noon. Each source is planned once (unique source key).
 */
export async function planVenuePosts(venue: Venue, appUrl: string, now = new Date()) {
  const rules = await socialRules(venue);
  const { channels } = await socialChannels(venue);
  if (!channels.length) return 0;
  const tz = venue.timezone;
  const today = localDate(now, tz);
  const all = await systemDb().select({ id: t.venue.id, name: t.venue.name }).from(t.venue);
  const nameOf = (id: string | null | undefined) => all.find((v) => v.id === id)?.name ?? null;
  const partners = await systemDb().select().from(t.venueIntegration).where(eq(t.venueIntegration.kind, "meta"));
  const igOf = (id: string | null | undefined) => (partners.find((p) => p.venueId === id)?.config as { igUsername?: string } | undefined)?.igUsername || null;
  let n = 0;
  const vv = { name: venue.name, slug: venue.slug, county: venue.county, timezone: tz };
  if (rules.events) {
    const upcoming = (await whatsOn(venue, now, new Date(now.getTime() + 3 * 86_400_000))).filter((o) => !o.auto);
    const cohosted = await systemDb().select().from(t.venueEvent).where(eq(t.venueEvent.partnerVenueId, venue.id));
    for (const o of upcoming) {
      const d = eventPost(vv, { id: o.id, title: o.title, details: o.details, start: o.start, kind: o.kind, partnerName: nameOf(o.partnerVenueId) }, appUrl, rules.eventHoursBefore);
      if (o.start <= now) continue;
      // Added at short notice: post it now rather than not at all.
      if (d.scheduledFor < now) d.scheduledFor = now;
      const collab = igOf(o.partnerVenueId);
      if (await insertDraft(venue, d, channels, rules.autoPublish, collab ? [collab] : [])) n++;
    }
    for (const e of cohosted.filter((e) => e.startsAt > now && e.startsAt.getTime() < now.getTime() + 3 * 86_400_000)) {
      const d = eventPost(vv, { id: e.id, title: e.title, details: e.details, start: e.startsAt, kind: e.kind, partnerName: nameOf(e.venueId) }, appUrl, rules.eventHoursBefore);
      if (d.scheduledFor < now) d.scheduledFor = now;
      const collab = igOf(e.venueId);
      if ((await insertDraft(venue, { ...d, sourceKey: `cohost:${e.id}:${e.startsAt.toISOString().slice(0, 10)}` }, channels, rules.autoPublish, collab ? [collab] : []))) n++;
    }
  }
  if (rules.games && venue.autoSports) {
    const end = localAt(today, "23:59", tz);
    const games = (await whatsOn(venue, now, end)).filter((o) => o.kind === "sport");
    const d = gamesPost(vv, today, games.map((g) => ({ title: g.title, start: g.start })), appUrl, localAt(today, "11:00", tz));
    if (d && d.scheduledFor.getTime() > now.getTime() - 6 * 3_600_000 && (await insertDraft(venue, d, channels, rules.autoPublish))) n++;
  }
  if (rules.weekly) {
    const week = mondayOf(today);
    const start = localAt(week, "00:00", tz);
    const items = (await whatsOn(venue, start, new Date(start.getTime() + 7 * 86_400_000))).filter((o) => !o.auto || o.kind === "sport").slice(0, 10);
    const d = weeklyPost(vv, week, items.map((o) => ({ title: o.title, start: o.start })), appUrl, localAt(week, "10:00", tz));
    if (d && d.scheduledFor.getTime() > now.getTime() - 24 * 3_600_000 && (await insertDraft(venue, d, channels, rules.autoPublish))) n++;
  }
  if (rules.newFood) {
    const items = await withTenant(venue.tenantId, (tx) => tx.select().from(t.menuItem).where(and(eq(t.menuItem.venueId, venue.id), eq(t.menuItem.active, true), gte(t.menuItem.createdAt, new Date(now.getTime() - 86_400_000)))));
    for (const it of items) {
      const d = newItemPost(vv, it, appUrl, localAt(today, "12:00", tz) > now ? localAt(today, "12:00", tz) : now);
      if (d && (await insertDraft(venue, d, channels, rules.autoPublish))) n++;
    }
  }
  return n;
}

/** Complete's own accounts: a weekly round-up per county of venues that opted in (needs 2+ venues). */
export async function planNetworkPosts(appUrl: string, channels: SocialChannel[], autoPublish: boolean, now = new Date()) {
  if (!channels.length) return 0;
  const vs = (await systemDb().select().from(t.venue).where(and(eq(t.venue.status, "live"), eq(t.venue.shareNetwork, true)))).filter((v) => v.county) as Venue[];
  let n = 0;
  for (const county of [...new Set(vs.map((v) => v.county!))]) {
    const inCounty = vs.filter((v) => v.county === county);
    const week = mondayOf(localDate(now, "Europe/Dublin"));
    const start = localAt(week, "00:00", "Europe/Dublin");
    const picks = [];
    for (const v of inCounty) for (const o of (await whatsOn(v, start, new Date(start.getTime() + 7 * 86_400_000))).filter((x) => !x.auto).slice(0, 3)) picks.push({ venue: v.name, slug: v.slug, title: o.title, start: o.start, tz: v.timezone });
    const d = networkPost(county, week, picks.sort((a, b) => a.start.getTime() - b.start.getTime()), appUrl, localAt(week, "12:00", "Europe/Dublin"));
    if (d && (await insertDraft(null, d, channels, autoPublish))) n++;
  }
  return n;
}

/** Approved posts that are due; drafts nobody approved within 6 hours of their time are skipped. */
export async function duePosts(now = new Date()) {
  await systemDb().update(t.socialPost).set({ status: "skipped", error: "Not approved in time" }).where(and(eq(t.socialPost.status, "draft"), lte(t.socialPost.scheduledFor, new Date(now.getTime() - 6 * 3_600_000))));
  return systemDb().select().from(t.socialPost).where(and(eq(t.socialPost.status, "approved"), lte(t.socialPost.scheduledFor, now))).orderBy(asc(t.socialPost.scheduledFor)).limit(25);
}

export async function markPost(id: string, ok: boolean, results: Record<string, string>, error: string | null) {
  await systemDb().update(t.socialPost).set({ status: ok ? "posted" : "failed", results, error: error?.slice(0, 500) ?? null, postedAt: ok ? new Date() : null }).where(eq(t.socialPost.id, id));
}

export async function postById(id: string) {
  const [p] = await systemDb().select().from(t.socialPost).where(eq(t.socialPost.id, id));
  return p ?? null;
}

export async function venuePosts(venue: Venue) {
  return systemDb().select().from(t.socialPost).where(and(eq(t.socialPost.venueId, venue.id), gte(t.socialPost.scheduledFor, new Date(Date.now() - 14 * 86_400_000)))).orderBy(desc(t.socialPost.scheduledFor)).limit(40);
}

export async function networkPosts() {
  return systemDb().select().from(t.socialPost).where(isNull(t.socialPost.venueId)).orderBy(desc(t.socialPost.scheduledFor)).limit(20);
}

/** Manager actions on a post: approve, skip, edit the text, or post a one-off now or later. */
export async function updateVenuePost(venue: Venue | null, id: string, change: { status?: "approved" | "skipped"; text?: string; scheduledFor?: Date }) {
  const [p] = await systemDb().select().from(t.socialPost).where(and(eq(t.socialPost.id, id), venue ? eq(t.socialPost.venueId, venue.id) : isNull(t.socialPost.venueId)));
  if (!p) throw new NotFound("Post not found");
  if (p.status === "posted") throw new NotFound("That post has already gone out");
  const text = change.text !== undefined ? change.text.trim().slice(0, 2000) : undefined;
  await systemDb().update(t.socialPost).set({ ...(change.status ? { status: change.status, error: null } : {}), ...(text ? { text } : {}), ...(change.scheduledFor ? { scheduledFor: change.scheduledFor } : {}) }).where(eq(t.socialPost.id, id));
}

export async function manualPost(venue: Venue, input: { text: string; scheduledFor?: Date; title?: string }) {
  const { channels } = await socialChannels(venue);
  if (!channels.length) throw new NotFound("Connect Facebook, Instagram or Google first");
  const text = input.text.trim().slice(0, 2000);
  if (text.length < 5) throw new NotFound("Write the post");
  await systemDb().insert(t.socialPost).values({
    tenantId: venue.tenantId, venueId: venue.id, sourceKey: `manual:${Date.now()}`, channels, text, link: null,
    imageTitle: (input.title || venue.name).slice(0, 60), imageSubtitle: venue.town ?? "", scheduledFor: input.scheduledFor ?? new Date(), status: "approved",
  });
}

/** Venues with a social account connected, for the planning job. */
export async function venuesWithSocial() {
  const rows = await systemDb().select({ venueId: t.venueIntegration.venueId }).from(t.venueIntegration).where(or(eq(t.venueIntegration.kind, "meta"), eq(t.venueIntegration.kind, "google_business")));
  if (!rows.length) return [];
  return (await systemDb().select().from(t.venue).where(inArray(t.venue.id, [...new Set(rows.map((r) => r.venueId))]))).filter((v) => v.status !== "suspended");
}
