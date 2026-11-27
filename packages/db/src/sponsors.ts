import { CartError } from "@round/core";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { systemDb, withTenant } from "./index";
import { managerEmails, queueEmail } from "./platform";
import * as t from "./schema";
import { NotFound, type Venue } from "./services";

/**
 * Sponsorship: a sponsor's placements in the app (e.g. Drumhierny Woodland Hideaway, wedding partner).
 * Always labelled as sponsored. Counts are anonymous; enquiries go to the sponsor only with consent.
 */
export type Sponsorship = typeof t.sponsorship.$inferSelect;
export const PLACEMENTS = ["landing", "hub", "venue", "platinum"] as const;
export type Placement = (typeof PLACEMENTS)[number];

/** Live sponsorships for a placement, with the sponsor venue's name and slug. */
export async function sponsorsFor(placement: Placement, now = new Date()) {
  const rows = await systemDb()
    .select({ s: t.sponsorship, venueName: t.venue.name, venueSlug: t.venue.slug, brandColor: t.venue.brandColor })
    .from(t.sponsorship)
    .innerJoin(t.venue, eq(t.venue.id, t.sponsorship.sponsorVenueId))
    .where(and(eq(t.sponsorship.active, true), lte(t.sponsorship.startsAt, now), gte(t.sponsorship.endsAt, now)));
  return rows.filter((r) => r.s.placements.includes(placement)).map((r) => ({ ...r.s, venueName: r.venueName, venueSlug: r.venueSlug, brandColor: r.brandColor }));
}

export async function sponsorBySlug(slug: string) {
  const [r] = await systemDb()
    .select({ s: t.sponsorship, venueName: t.venue.name, venueSlug: t.venue.slug, brandColor: t.venue.brandColor, town: t.venue.town })
    .from(t.sponsorship)
    .innerJoin(t.venue, eq(t.venue.id, t.sponsorship.sponsorVenueId))
    .where(eq(t.sponsorship.slug, slug));
  if (!r || !r.s.active) throw new NotFound("Not found");
  return { ...r.s, venueName: r.venueName, venueSlug: r.venueSlug, brandColor: r.brandColor, town: r.town };
}

/** Counts a view, click or lead for the sponsor's report (one row per sponsorship, day and placement). */
export async function countSponsor(id: string, placement: string, what: "impressions" | "clicks" | "leads", now = new Date()) {
  const date = now.toISOString().slice(0, 10);
  const p = String(placement).replace(/[^a-z]/g, "").slice(0, 20) || "other";
  const col = t.sponsorStat[what];
  await systemDb()
    .insert(t.sponsorStat)
    .values({ sponsorshipId: id, date, placement: p, [what]: 1 })
    .onConflictDoUpdate({ target: [t.sponsorStat.sponsorshipId, t.sponsorStat.date, t.sponsorStat.placement], set: { [what]: sql`${col} + 1` } });
}

export interface LeadInput {
  name: string;
  email: string;
  phone?: string;
  eventDate?: string | null;
  guests?: number | null;
  message?: string;
  consent: boolean;
}

/** An enquiry for the sponsor (e.g. a wedding at Drumhierny). Needs consent; the sponsor's managers are emailed once. */
export async function submitLead(slug: string, input: LeadInput, customerId: string | null, now = new Date()) {
  const s = await sponsorBySlug(slug);
  if (!input.consent) throw new CartError(`Tick the box so we can pass your details to ${s.venueName}`);
  const name = String(input.name ?? "").trim().slice(0, 80), email = String(input.email ?? "").trim().toLowerCase().slice(0, 200);
  if (name.length < 2) throw new CartError("Your name, please");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new CartError("A valid email, please");
  const eventDate = input.eventDate && /^\d{4}-\d{2}-\d{2}$/.test(input.eventDate) && Date.parse(input.eventDate) > now.getTime() - 86_400_000 ? input.eventDate : null;
  const guests = input.guests ? Math.max(1, Math.min(2000, Math.round(Number(input.guests)))) : null;
  const [venue] = await systemDb().select().from(t.venue).where(eq(t.venue.id, s.sponsorVenueId));
  const lead = await withTenant(venue.tenantId, async (tx) => {
    const [l] = await tx
      .insert(t.sponsorLead)
      .values({ tenantId: venue.tenantId, venueId: venue.id, sponsorshipId: s.id, customerId, name, email, phone: String(input.phone ?? "").trim().slice(0, 30), eventDate, guests, message: String(input.message ?? "").trim().slice(0, 1000), consentAt: now })
      .returning();
    return l;
  });
  await countSponsor(s.id, "page", "leads", now);
  const text = `New ${s.title} enquiry through Complete.\n\nName: ${name}\nEmail: ${email}\nPhone: ${lead.phone || "-"}\nDate: ${eventDate ?? "not set"}\nGuests: ${guests ?? "not set"}\n\n${lead.message}\n\nThey agreed to be contacted by ${s.venueName}. See all enquiries in your back office.`;
  for (const to of await managerEmails(venue as Venue)) await queueEmail({ to, subject: `New enquiry: ${name}${eventDate ? `, ${eventDate}` : ""}`, text, replyTo: email, dedupeKey: `lead:${lead.id}:${to}` });
  return lead;
}

/** The sponsor's enquiries, for its back office. */
export async function sponsorLeads(venue: Venue) {
  return withTenant(venue.tenantId, (tx) => tx.select().from(t.sponsorLead).where(eq(t.sponsorLead.venueId, venue.id)).orderBy(desc(t.sponsorLead.createdAt)).limit(200));
}

export async function setLeadStatus(venue: Venue, id: string, status: "new" | "contacted" | "booked" | "closed") {
  const r = await withTenant(venue.tenantId, (tx) => tx.update(t.sponsorLead).set({ status }).where(and(eq(t.sponsorLead.id, id), eq(t.sponsorLead.venueId, venue.id))).returning());
  if (!r.length) throw new NotFound("Not found");
}

/** Totals for a sponsorship's report (operator console and the sponsor's back office). */
export async function sponsorReport(sponsorshipId: string, days = 30) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  return systemDb()
    .select({ placement: t.sponsorStat.placement, impressions: sql<number>`sum(${t.sponsorStat.impressions})::int`, clicks: sql<number>`sum(${t.sponsorStat.clicks})::int`, leads: sql<number>`sum(${t.sponsorStat.leads})::int` })
    .from(t.sponsorStat)
    .where(and(eq(t.sponsorStat.sponsorshipId, sponsorshipId), gte(t.sponsorStat.date, since)))
    .groupBy(t.sponsorStat.placement);
}

/** Sponsorships a venue holds (for its back office). */
export async function venueSponsorships(venue: Venue) {
  return systemDb().select().from(t.sponsorship).where(eq(t.sponsorship.sponsorVenueId, venue.id));
}

/** All sponsorships, for Complete's operator console. */
export async function allSponsorships() {
  return systemDb()
    .select({ s: t.sponsorship, venueName: t.venue.name })
    .from(t.sponsorship)
    .innerJoin(t.venue, eq(t.venue.id, t.sponsorship.sponsorVenueId))
    .orderBy(desc(t.sponsorship.startsAt));
}

export async function setSponsorshipActive(id: string, active: boolean) {
  await systemDb().update(t.sponsorship).set({ active }).where(eq(t.sponsorship.id, id));
}
