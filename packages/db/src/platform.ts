// Running many venues without anyone at Complete stepping in: shared rate limits,
// an email outbox with retries, error tracking, staff invite/reset links, venue
// health alerts, onboarding nudges, monthly invoices, data retention and the
// operator overview. System tables are not tenant data; tenant tables go through withTenant.
import { createHash, randomBytes } from "node:crypto";
import { hashPassword, invoiceNumber, invoicePeriod, retryDelayMs, sageMapped, venueAlerts, type AlertSpec, type SageMapping } from "@round/core";
import { and, asc, count, desc, eq, gte, inArray, isNull, lt, lte, ne, sql } from "drizzle-orm";
import { systemDb, withTenant } from "./index";
import * as t from "./schema";
import { setupStatus } from "./onboarding";
import { billingStatement, type Venue } from "./services";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

// ---------------------------------------------------------------- rate limits

/** True if `key` has made fewer than `limit` calls in the current window. Counts this call. Shared by every instance. */
export async function rateAllow(key: string, limit: number, windowMs: number, now = new Date()): Promise<boolean> {
  const cutoff = new Date(now.getTime() - windowMs);
  const r = await systemDb().execute<{ hits: number }>(sql`
    insert into rate_bucket (key, window_start, hits) values (${key}, ${now}, 1)
    on conflict (key) do update set
      hits = case when rate_bucket.window_start <= ${cutoff} then 1 else rate_bucket.hits + 1 end,
      window_start = case when rate_bucket.window_start <= ${cutoff} then ${now} else rate_bucket.window_start end
    returning hits`);
  return Number(r.rows[0].hits) <= limit;
}

// ---------------------------------------------------------------- email outbox

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  attachments?: { filename: string; content: string; contentType: string }[];
  /** the same key is only ever sent once (alerts, nudges, invoices) */
  dedupeKey?: string;
}

/** Records an email to send. Returns its id, or null if one with the same dedupe key exists. */
export async function queueEmail(m: OutgoingEmail): Promise<string | null> {
  const [row] = await systemDb()
    .insert(t.emailOutbox)
    .values({ to: m.to, subject: m.subject, text: m.text, html: m.html ?? null, replyTo: m.replyTo ?? null, attachments: m.attachments ?? null, dedupeKey: m.dedupeKey ?? null })
    .onConflictDoNothing()
    .returning({ id: t.emailOutbox.id });
  return row?.id ?? null;
}

export async function emailById(id: string) {
  const [row] = await systemDb().select().from(t.emailOutbox).where(eq(t.emailOutbox.id, id));
  return row ?? null;
}

export async function markEmailSent(id: string) {
  await systemDb().update(t.emailOutbox).set({ status: "sent", sentAt: new Date(), attempts: sql`${t.emailOutbox.attempts} + 1`, lastError: null }).where(eq(t.emailOutbox.id, id));
}

/** Schedules the next try with back-off, or marks the email failed after the last one. */
export async function markEmailFailed(id: string, error: string) {
  const [row] = await systemDb().select({ attempts: t.emailOutbox.attempts }).from(t.emailOutbox).where(eq(t.emailOutbox.id, id));
  const attempts = (row?.attempts ?? 0) + 1;
  const delay = retryDelayMs(attempts);
  await systemDb()
    .update(t.emailOutbox)
    .set({ attempts, lastError: error.slice(0, 500), status: delay === null ? "failed" : "pending", nextAttemptAt: new Date(Date.now() + (delay ?? 0)) })
    .where(eq(t.emailOutbox.id, id));
}

/** Emails due a (re)try, oldest first. */
export async function dueEmails(limit = 50, now = new Date()) {
  return systemDb().select().from(t.emailOutbox).where(and(eq(t.emailOutbox.status, "pending"), lte(t.emailOutbox.nextAttemptAt, now))).orderBy(asc(t.emailOutbox.nextAttemptAt)).limit(limit);
}

// ---------------------------------------------------------------- errors

/** Groups a server error by message and first stack frame, counting repeats. Never throws. */
export async function recordError(e: unknown, context = ""): Promise<void> {
  try {
    const err = e instanceof Error ? e : new Error(String(e));
    const frame = (err.stack ?? "").split("\n").find((l) => l.trim().startsWith("at ")) ?? "";
    const message = err.message.split("\n")[0].slice(0, 300);
    const fingerprint = sha256(`${message.replace(/[0-9a-f]{8}-[0-9a-f-]{27}|\d+/g, "#")}|${frame.trim()}`).slice(0, 32);
    await systemDb()
      .insert(t.appError)
      .values({ fingerprint, message, context: context.slice(0, 200), stack: (err.stack ?? "").slice(0, 2000) })
      .onConflictDoUpdate({ target: t.appError.fingerprint, set: { count: sql`${t.appError.count} + 1`, lastAt: new Date(), context: context.slice(0, 200) } });
  } catch {
    // error tracking must never break the request
  }
}

export async function recentErrors(limit = 20) {
  return systemDb().select().from(t.appError).orderBy(desc(t.appError.lastAt)).limit(limit);
}

// ---------------------------------------------------------------- staff invite and reset links

export const INVITE_TTL_MS = 7 * 86_400_000;
export const RESET_TTL_MS = 30 * 60_000;

/** A one-time link token for a staff member. Earlier unused links of the same kind stop working. */
export async function createStaffToken(staffId: string, purpose: "invite" | "reset"): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  await systemDb().transaction(async (tx) => {
    await tx.update(t.staffToken).set({ usedAt: new Date() }).where(and(eq(t.staffToken.staffId, staffId), eq(t.staffToken.purpose, purpose), isNull(t.staffToken.usedAt)));
    await tx.insert(t.staffToken).values({ staffId, purpose, tokenHash: sha256(token), expiresAt: new Date(Date.now() + (purpose === "invite" ? INVITE_TTL_MS : RESET_TTL_MS)) });
  });
  return token;
}

/** Staff member for a sign-in email (for "forgot password"), with their venue. */
export async function staffForEmail(email: string) {
  const [row] = await systemDb()
    .select({ id: t.staffUser.id, name: t.staffUser.name, email: t.staffUser.email, venueName: t.venue.name, venueSlug: t.venue.slug })
    .from(t.staffUser)
    .innerJoin(t.venue, eq(t.venue.id, t.staffUser.venueId))
    .where(eq(sql`lower(${t.staffUser.email})`, email.trim().toLowerCase()));
  return row ?? null;
}

/** Who a link is for, if it's still valid (for the set-password page). */
export async function staffTokenInfo(token: string) {
  const [row] = await systemDb()
    .select({ purpose: t.staffToken.purpose, name: t.staffUser.name, email: t.staffUser.email })
    .from(t.staffToken)
    .innerJoin(t.staffUser, eq(t.staffUser.id, t.staffToken.staffId))
    .where(and(eq(t.staffToken.tokenHash, sha256(token)), isNull(t.staffToken.usedAt), gte(t.staffToken.expiresAt, new Date())));
  return row ?? null;
}

/** Sets a new password from a valid link and uses the link up. Returns the staff id, or null if the link is invalid. */
export async function setPasswordWithToken(token: string, password: string): Promise<string | null> {
  if (password.length < 10) throw new Error("Use at least 10 characters");
  return systemDb().transaction(async (tx) => {
    const [tk] = await tx
      .select()
      .from(t.staffToken)
      .where(and(eq(t.staffToken.tokenHash, sha256(token)), isNull(t.staffToken.usedAt), gte(t.staffToken.expiresAt, new Date())))
      .for("update");
    if (!tk) return null;
    await tx.update(t.staffToken).set({ usedAt: new Date() }).where(eq(t.staffToken.staffId, tk.staffId));
    const [s] = await tx.update(t.staffUser).set({ passwordHash: hashPassword(password), mustChangePassword: false }).where(eq(t.staffUser.id, tk.staffId)).returning();
    await tx.insert(t.auditLog).values({ tenantId: s.tenantId, actor: `staff:${s.id}`, action: tk.purpose === "invite" ? "staff.invite_accepted" : "staff.password_reset", entity: `staff:${s.id}` });
    return s.id;
  });
}

// ---------------------------------------------------------------- venue health alerts

export async function managerEmails(venue: Venue): Promise<string[]> {
  const rows = await withTenant(venue.tenantId, (tx) => tx.select({ email: t.staffUser.email }).from(t.staffUser).where(and(eq(t.staffUser.venueId, venue.id), eq(t.staffUser.role, "admin"))));
  return rows.map((r) => r.email);
}

/** Reads a venue's syncs, integrations and payments and works out what its managers should be told. */
export async function venueHealth(venue: Venue, now = new Date()): Promise<AlertSpec[]> {
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
  const data = await withTenant(venue.tenantId, async (tx) => {
    const syncs = await tx.select().from(t.xeroSync).where(and(eq(t.xeroSync.venueId, venue.id), gte(t.xeroSync.businessDate, weekAgo), eq(t.xeroSync.status, "error")));
    const ints = await tx.select().from(t.venueIntegration).where(eq(t.venueIntegration.venueId, venue.id));
    const [stuck] = await tx
      .select({ n: count() })
      .from(t.orders)
      .where(and(eq(t.orders.venueId, venue.id), eq(t.orders.status, "pending_payment"), lt(t.orders.createdAt, new Date(now.getTime() - 30 * 60_000)), gte(t.orders.createdAt, new Date(now.getTime() - 86_400_000)), ne(t.orders.provider, "mock")));
    return { syncs, ints, stuck: stuck.n };
  });
  const byTarget = new Map<string, { days: number; lastError: string; at: Date }>();
  for (const s of data.syncs) {
    const cur = byTarget.get(s.target);
    if (!cur) byTarget.set(s.target, { days: 1, lastError: s.error ?? "", at: s.updatedAt });
    else byTarget.set(s.target, { days: cur.days + 1, lastError: s.updatedAt > cur.at ? s.error ?? "" : cur.lastError, at: s.updatedAt > cur.at ? s.updatedAt : cur.at });
  }
  const cfg = (k: string) => data.ints.find((i) => i.kind === k);
  const xero = cfg("xero"), sage = cfg("sage");
  const xc = (xero?.config ?? {}) as Record<string, string>;
  const dayOld = (d?: Date) => !!d && now.getTime() - d.getTime() > 86_400_000;
  return venueAlerts({
    slug: venue.slug,
    syncErrors: [...byTarget].map(([target, v]) => ({ target, days: v.days, lastError: v.lastError })),
    xeroUnmapped: !!xero?.secretEnc && dayOld(xero.updatedAt) && !(xc.taxType9 && xc.taxType23 && xc.paymentAccountCode),
    sageUnmapped: !!sage?.secretEnc && dayOld(sage.updatedAt) && !sageMapped(sage.config as Partial<SageMapping>),
    stuckPayments: data.stuck,
    live: venue.status === "live",
  });
}

/**
 * Raises the given alerts and resolves the venue's others. Returns the alerts that are
 * new (or came back after being resolved), which are the ones to email about.
 */
export async function syncAlerts(venue: Venue, specs: AlertSpec[], now = new Date()) {
  return withTenant(venue.tenantId, async (tx) => {
    const existing = await tx.select().from(t.venueAlert).where(eq(t.venueAlert.venueId, venue.id));
    const fresh: AlertSpec[] = [];
    for (const a of specs) {
      const cur = existing.find((e) => e.key === a.key);
      if (!cur) {
        await tx.insert(t.venueAlert).values({ tenantId: venue.tenantId, venueId: venue.id, ...a, firstAt: now, lastAt: now });
        fresh.push(a);
      } else {
        await tx.update(t.venueAlert).set({ ...a, lastAt: now, resolvedAt: null, ...(cur.resolvedAt ? { firstAt: now, notifiedAt: null } : {}) }).where(eq(t.venueAlert.id, cur.id));
        if (cur.resolvedAt || !cur.notifiedAt) fresh.push(a);
      }
    }
    const active = new Set(specs.map((a) => a.key));
    const gone = existing.filter((e) => !e.resolvedAt && !active.has(e.key)).map((e) => e.id);
    if (gone.length) await tx.update(t.venueAlert).set({ resolvedAt: now }).where(inArray(t.venueAlert.id, gone));
    return fresh;
  });
}

export async function markAlertsNotified(venue: Venue, keys: string[]) {
  if (!keys.length) return;
  await withTenant(venue.tenantId, (tx) => tx.update(t.venueAlert).set({ notifiedAt: new Date() }).where(and(eq(t.venueAlert.venueId, venue.id), inArray(t.venueAlert.key, keys))));
}

export async function openAlerts(venue: Venue) {
  return withTenant(venue.tenantId, (tx) => tx.select().from(t.venueAlert).where(and(eq(t.venueAlert.venueId, venue.id), isNull(t.venueAlert.resolvedAt))).orderBy(asc(t.venueAlert.severity), desc(t.venueAlert.lastAt)));
}

// ---------------------------------------------------------------- onboarding nudges

/** Venues still in test mode, with how long since sign-up and what's left to do. */
export async function venuesInSetup(now = new Date()) {
  const vs = await systemDb().select().from(t.venue).where(eq(t.venue.status, "setup"));
  const out = [];
  for (const v of vs) {
    const ageDays = Math.floor((now.getTime() - v.createdAt.getTime()) / 86_400_000);
    out.push({ venue: v, ageDays });
  }
  return out;
}

/** The set-up steps still missing (uses the same checklist as the set-up page). */
export async function setupMissing(venue: Venue): Promise<string[]> {
  return (await setupStatus(venue)).missing;
}

// ---------------------------------------------------------------- monthly invoices

/** Issues Complete's invoice to a venue for a month, once. Returns it, and whether it's new. */
export async function issueInvoice(venue: Venue, year: number, month: number) {
  const period = invoicePeriod(year, month);
  const st = await billingStatement(venue, year, month);
  return withTenant(venue.tenantId, async (tx) => {
    const [row] = await tx
      .insert(t.billingInvoice)
      .values({ tenantId: venue.tenantId, venueId: venue.id, period, number: invoiceNumber(period, venue.slug), statement: st, totalCents: st.totalCents })
      .onConflictDoNothing()
      .returning();
    if (row) return { invoice: row, isNew: true };
    const [existing] = await tx.select().from(t.billingInvoice).where(and(eq(t.billingInvoice.venueId, venue.id), eq(t.billingInvoice.period, period)));
    return { invoice: existing, isNew: false };
  });
}

export async function markInvoiceEmailed(venue: Venue, id: string) {
  await withTenant(venue.tenantId, (tx) => tx.update(t.billingInvoice).set({ emailedAt: new Date() }).where(eq(t.billingInvoice.id, id)));
}

export async function venueInvoices(venue: Venue) {
  return withTenant(venue.tenantId, (tx) => tx.select().from(t.billingInvoice).where(eq(t.billingInvoice.venueId, venue.id)).orderBy(desc(t.billingInvoice.period)).limit(24));
}

/** Every venue that isn't suspended, for the health check. */
export async function activeVenues() {
  return systemDb().select().from(t.venue).where(ne(t.venue.status, "suspended"));
}

export async function liveVenueList() {
  return systemDb().select().from(t.venue).where(eq(t.venue.status, "live"));
}

// ---------------------------------------------------------------- data retention

/**
 * Deletes what's no longer needed: used or expired sign-in codes and links, stale rate
 * counters, email bodies after 90 days (the record stays), resolved alerts and old error
 * groups after 90 days, and raw payment notifications after 18 months (orders themselves
 * are kept for VAT records).
 */
export async function pruneData(now = new Date()) {
  const db = systemDb();
  const ago = (days: number) => new Date(now.getTime() - days * 86_400_000);
  const n = async (q: Promise<unknown[]>) => (await q).length;
  return {
    otpCodes: await n(db.delete(t.otpCode).where(lt(t.otpCode.expiresAt, ago(1))).returning({ id: t.otpCode.phone })),
    signupCodes: await n(db.delete(t.signupCode).where(lt(t.signupCode.expiresAt, ago(1))).returning({ id: t.signupCode.email })),
    staffTokens: await n(db.delete(t.staffToken).where(lt(t.staffToken.expiresAt, ago(1))).returning({ id: t.staffToken.id })),
    rateBuckets: await n(db.delete(t.rateBucket).where(lt(t.rateBucket.windowStart, ago(1))).returning({ id: t.rateBucket.key })),
    emailBodies: await n(
      db.update(t.emailOutbox).set({ text: "", html: null, attachments: null }).where(and(ne(t.emailOutbox.status, "pending"), lt(t.emailOutbox.createdAt, ago(90)), ne(t.emailOutbox.text, ""))).returning({ id: t.emailOutbox.id }),
    ),
    errors: await n(db.delete(t.appError).where(lt(t.appError.lastAt, ago(90))).returning({ id: t.appError.fingerprint })),
    alerts: await n(db.delete(t.venueAlert).where(lt(t.venueAlert.resolvedAt, ago(90))).returning({ id: t.venueAlert.id })),
    webhookEvents: await n(db.delete(t.webhookEvent).where(lt(t.webhookEvent.receivedAt, ago(548))).returning({ id: t.webhookEvent.id })),
  };
}

// ---------------------------------------------------------------- operator overview

/** Every venue at a glance for Complete's own team: status, set-up, activity, alerts, billing. */
export async function opsOverview(now = new Date()) {
  const db = systemDb();
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000);
  const venues = await db.select().from(t.venue).orderBy(asc(t.venue.name));
  const orders = await db
    .select({ venueId: t.orders.venueId, n: count(), gross: sql<number>`coalesce(sum(${t.orders.amountPaidCents}),0)::int`, last: sql<Date | null>`max(${t.orders.paidAt})` })
    .from(t.orders)
    .where(and(inArray(t.orders.status, ["paid", "refunded"]), gte(t.orders.paidAt, monthAgo)))
    .groupBy(t.orders.venueId);
  const alerts = await db.select({ venueId: t.venueAlert.venueId, n: count() }).from(t.venueAlert).where(isNull(t.venueAlert.resolvedAt)).groupBy(t.venueAlert.venueId);
  const invoices = await db.select().from(t.billingInvoice).orderBy(desc(t.billingInvoice.period)).limit(500);
  const subs = await db.select().from(t.subscription);
  const outbox = await db.select({ status: t.emailOutbox.status, n: count() }).from(t.emailOutbox).groupBy(t.emailOutbox.status);
  return {
    venues: venues.map((v) => {
      const o = orders.find((x) => x.venueId === v.id);
      const inv = invoices.find((i) => i.venueId === v.id);
      const sub = subs.find((s) => s.venueId === v.id);
      return {
        id: v.id, slug: v.slug, name: v.name, town: v.town, kind: v.kind, status: v.status, createdAt: v.createdAt, liveAt: v.liveAt,
        orders30d: o?.n ?? 0, paid30dCents: o?.gross ?? 0, lastOrderAt: o?.last ?? null,
        openAlerts: alerts.find((a) => a.venueId === v.id)?.n ?? 0,
        monthlyFeeCents: sub?.monthlyFeeCents ?? 0, trialEndsAt: sub?.trialEndsAt ?? null,
        lastInvoice: inv ? { period: inv.period, totalCents: inv.totalCents, status: inv.status } : null,
      };
    }),
    outbox: Object.fromEntries(outbox.map((r) => [r.status, r.n])) as Partial<Record<"pending" | "sent" | "failed", number>>,
    failedEmails: await db.select({ id: t.emailOutbox.id, to: t.emailOutbox.to, subject: t.emailOutbox.subject, lastError: t.emailOutbox.lastError, createdAt: t.emailOutbox.createdAt }).from(t.emailOutbox).where(eq(t.emailOutbox.status, "failed")).orderBy(desc(t.emailOutbox.createdAt)).limit(10),
    errors: await recentErrors(15),
  };
}

