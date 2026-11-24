import {
  DEFAULT_APP_FEE_BPS,
  DEFAULT_MONTHLY_FEE_CENTS,
  OnboardingError,
  RESERVED_SLUGS,
  TRIAL_DAYS,
  defaultCategories,
  defaultLevels,
  hashOtp,
  hashPassword,
  newOtp,
  normaliseEmail,
  setupChecklist,
  slugify,
  type CleanSignup,
  type VenueKind,
} from "@round/core";
import { and, count, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { systemDb, withTenant } from "./index";
import * as t from "./schema";
import type { Staff, Venue } from "./services";

const CODE_TTL_MS = 15 * 60_000;
const CODE_RESEND_MS = 60_000;
const CODE_MAX_ATTEMPTS = 5;

/**
 * Emails a 6-digit code to a new business (returned so the caller can send it, or show it in dev).
 * Says nothing about whether the email already has an account.
 */
export async function requestSignupCode(emailInput: string, secret: string): Promise<{ email: string; code: string }> {
  const email = normaliseEmail(emailInput);
  if (!email) throw new OnboardingError("Enter a valid email address");
  const db = systemDb();
  const [prev] = await db.select().from(t.signupCode).where(eq(t.signupCode.email, email));
  if (prev && Date.now() - prev.sentAt.getTime() < CODE_RESEND_MS) throw new OnboardingError("We've just sent a code. Wait a minute before asking for another.");
  const code = newOtp();
  const row = { email, codeHash: hashOtp(`signup:${email}`, code, secret), expiresAt: new Date(Date.now() + CODE_TTL_MS), attempts: 0, sentAt: new Date() };
  await db.insert(t.signupCode).values(row).onConflictDoUpdate({ target: t.signupCode.email, set: row });
  return { email, code };
}

/** Example items so a new venue can try ordering straight away. Prices are placeholders to edit. */
const EXAMPLE_ITEMS: Record<VenueKind, [cat: number, name: string, cents: number, vat: 9 | 23, station: "bar" | "kitchen", alcohol: boolean][]> = {
  bar: [
    [0, "Pint of stout", 620, 23, "bar", true],
    [0, "Pint of lager", 640, 23, "bar", true],
    [0, "Gin & tonic", 950, 23, "bar", true],
    [1, "Soft drink", 350, 23, "bar", false],
    [1, "Flat white", 380, 9, "bar", false],
    [2, "Toasted special", 950, 9, "kitchen", false],
    [2, "Fish & chips", 1700, 9, "kitchen", false],
  ],
  restaurant: [
    [0, "Soup of the day", 750, 9, "kitchen", false],
    [1, "Fish & chips", 1700, 9, "kitchen", false],
    [1, "Beef burger", 1800, 9, "kitchen", false],
    [2, "Sticky toffee pudding", 800, 9, "kitchen", false],
    [3, "Glass of house wine", 800, 23, "bar", true],
    [3, "Soft drink", 350, 23, "bar", false],
  ],
  hotel: [
    [0, "Pint of stout", 620, 23, "bar", true],
    [0, "Glass of house wine", 800, 23, "bar", true],
    [1, "Club sandwich", 1350, 9, "kitchen", false],
    [1, "Fish & chips", 1700, 9, "kitchen", false],
    [2, "Pot of tea", 350, 9, "bar", false],
    [2, "Soft drink", 350, 23, "bar", false],
  ],
  cafe: [
    [0, "Flat white", 380, 9, "bar", false],
    [0, "Pot of tea", 350, 9, "bar", false],
    [1, "Fresh orange juice", 450, 23, "bar", false],
    [2, "Scone with jam", 400, 9, "kitchen", false],
    [2, "Toasted special", 950, 9, "kitchen", false],
  ],
};

async function uniqueSlug(base: string, town: string): Promise<string> {
  const db = systemDb();
  const taken = async (s: string) => RESERVED_SLUGS.has(s) || (await db.select({ id: t.venue.id }).from(t.venue).where(eq(t.venue.slug, s))).length > 0;
  const first = slugify(base);
  if (!(await taken(first))) return first;
  if (town) {
    const withTown = slugify(`${base} ${town}`);
    if (!(await taken(withTown))) return withTown;
  }
  for (let i = 2; i < 50; i++) if (!(await taken(`${first}-${i}`))) return `${first}-${i}`;
  return `${first}-${randomBytes(3).toString("hex")}`;
}

/**
 * Creates a business from a verified email: tenant, loyalty programme, venue (in test mode),
 * tables, menu sections, a free trial and the owner's admin login. All or nothing.
 */
export async function createBusiness(input: CleanSignup, code: string, secret: string): Promise<{ venue: Venue; staff: Staff }> {
  const db = systemDb();
  const slug = await uniqueSlug(input.venueName, input.town);
  const res = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(t.signupCode).where(eq(t.signupCode.email, input.email)).for("update");
    if (!row || row.expiresAt < new Date() || row.attempts >= CODE_MAX_ATTEMPTS) throw new OnboardingError("That code has expired. Ask for a new one.");
    if (row.codeHash !== hashOtp(`signup:${input.email}`, String(code ?? "").trim(), secret)) {
      await tx.update(t.signupCode).set({ attempts: row.attempts + 1 }).where(eq(t.signupCode.email, input.email));
      return null; // commit the failed attempt, then refuse
    }
    if ((await tx.select({ id: t.staffUser.id }).from(t.staffUser).where(eq(t.staffUser.email, input.email))).length)
      throw new OnboardingError("There's already an account for this email. Sign in instead.");
    await tx.delete(t.signupCode).where(eq(t.signupCode.email, input.email));

    const [ten] = await tx.insert(t.tenant).values({ name: input.venueName }).returning();
    const tenantId = ten.id;
    const [prog] = await tx
      .insert(t.programme)
      .values({ tenantId, name: `${input.venueName} Rewards`.slice(0, 100), pointsPerEuro: 10, pointsPerCreditEuro: 100, signupCreditCents: 500, referralPoints: 500 })
      .returning();
    await tx.insert(t.programmeLevel).values(defaultLevels().map((l) => ({ tenantId, programmeId: prog.id, ...l })));
    const [venue] = await tx
      .insert(t.venue)
      .values({ tenantId, programmeId: prog.id, slug, name: input.venueName, town: input.town, kind: input.kind, status: "setup", paymentProvider: "mock" })
      .returning();
    await tx.insert(t.subscription).values({
      tenantId,
      venueId: venue.id,
      monthlyFeeCents: DEFAULT_MONTHLY_FEE_CENTS,
      appFeeBps: DEFAULT_APP_FEE_BPS,
      trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86_400_000),
    });
    if (input.tables > 0)
      await tx
        .insert(t.venueTable)
        .values(Array.from({ length: input.tables }, (_, i) => ({ tenantId, venueId: venue.id, number: i + 1, qrToken: randomBytes(6).toString("base64url") })));
    const cats = await tx
      .insert(t.menuCategory)
      .values(defaultCategories(input.kind).map((name, sort) => ({ tenantId, venueId: venue.id, name, sort })))
      .returning();
    if (input.exampleMenu)
      await tx.insert(t.menuItem).values(
        EXAMPLE_ITEMS[input.kind].map(([cat, name, priceCents, vatRate, station, containsAlcohol], sort) => ({
          tenantId,
          venueId: venue.id,
          categoryId: cats[Math.min(cat, cats.length - 1)].id,
          name,
          priceCents,
          vatRate,
          station,
          containsAlcohol,
          availableForCollect: station === "bar",
          sort,
        })),
      );
    const [staff] = await tx
      .insert(t.staffUser)
      .values({ tenantId, venueId: venue.id, email: input.email, name: input.ownerName, role: "admin", passwordHash: hashPassword(input.password) })
      .returning();
    await tx.insert(t.auditLog).values({ tenantId, actor: `staff:${staff.id}`, action: "business.created", entity: `venue:${venue.id}`, detail: { slug, kind: input.kind, tables: input.tables } });
    return { venue, staff };
  });
  if (!res) throw new OnboardingError("That code isn't right");
  return res;
}

/** Where a venue is with its set-up, for the checklist and the go-live check. */
export async function setupStatus(venue: Venue) {
  const state = await withTenant(venue.tenantId, async (tx) => {
    const [items] = await tx.select({ n: count() }).from(t.menuItem).where(and(eq(t.menuItem.venueId, venue.id), eq(t.menuItem.active, true)));
    const [tables] = await tx.select({ n: count() }).from(t.venueTable).where(and(eq(t.venueTable.venueId, venue.id), eq(t.venueTable.active, true)));
    const [staff] = await tx.select({ n: count() }).from(t.staffUser).where(eq(t.staffUser.venueId, venue.id));
    const ints = await tx.select().from(t.venueIntegration).where(eq(t.venueIntegration.venueId, venue.id));
    const has = (k: string) => ints.some((r) => r.kind === k && !!r.secretEnc);
    const [sub] = await tx.select().from(t.subscription).where(eq(t.subscription.venueId, venue.id));
    return {
      checklist: {
        emailVerified: true,
        activeItems: items.n,
        tables: tables.n,
        paymentsReady: venue.paymentProvider !== "mock" && has(venue.paymentProvider),
        vatNumber: venue.vatNumber,
        googlePlace: !!venue.googlePlaceId,
        xeroConnected: has("xero"),
        staffCount: staff.n,
      },
      trialEndsAt: sub?.trialEndsAt ?? null,
    };
  });
  return { ...setupChecklist(state.checklist, venue.slug), trialEndsAt: state.trialEndsAt, status: venue.status };
}

/** Takes the venue out of test mode once every required step is done. */
export async function goLive(venue: Venue, staff: Staff) {
  if (staff.role !== "admin" || staff.venueId !== venue.id) throw new OnboardingError("Only a manager can do that");
  if (venue.status === "live") return;
  if (venue.status === "suspended") throw new OnboardingError("This venue is suspended. Contact support.");
  const s = await setupStatus(venue);
  if (!s.canGoLive) throw new OnboardingError(`Before going live: ${s.missing.join("; ")}`);
  await withTenant(venue.tenantId, async (tx) => {
    await tx.update(t.venue).set({ status: "live", liveAt: new Date() }).where(eq(t.venue.id, venue.id));
    await tx.insert(t.auditLog).values({ tenantId: venue.tenantId, actor: `staff:${staff.id}`, action: "venue.live", entity: `venue:${venue.id}` });
  });
}
