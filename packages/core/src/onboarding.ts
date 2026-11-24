// Self-serve sign-up for venues: validation, defaults, the go-live checklist and the free trial.

export class OnboardingError extends Error {}

export const VENUE_KINDS = ["bar", "restaurant", "hotel", "cafe"] as const;
export type VenueKind = (typeof VENUE_KINDS)[number];

export const TRIAL_DAYS = 30;
export const MAX_TABLES = 200;
export const MIN_PASSWORD = 10;
export const DEFAULT_MONTHLY_FEE_CENTS = 9900;
export const DEFAULT_APP_FEE_BPS = 100;

export interface BusinessSignupInput {
  email: string;
  ownerName: string;
  password: string;
  venueName: string;
  kind: string;
  town: string;
  tables: number;
  exampleMenu: boolean;
  acceptTerms: boolean;
}
export interface CleanSignup extends Omit<BusinessSignupInput, "kind"> {
  kind: VenueKind;
}

export function normaliseEmail(input: string): string | null {
  const e = String(input ?? "").trim().toLowerCase();
  return /^[^\s@]{1,64}@[^\s@]{1,253}\.[a-z]{2,}$/.test(e) && e.length <= 254 ? e : null;
}

/** Checks everything a new business types in. Throws OnboardingError with a message to show them. */
export function validateSignup(input: BusinessSignupInput): CleanSignup {
  const email = normaliseEmail(input.email);
  if (!email) throw new OnboardingError("Enter a valid email address");
  const ownerName = String(input.ownerName ?? "").trim();
  if (ownerName.length < 2 || ownerName.length > 80) throw new OnboardingError("Enter your name");
  const venueName = String(input.venueName ?? "").trim().replace(/\s+/g, " ");
  if (venueName.length < 2 || venueName.length > 80) throw new OnboardingError("Enter your venue's name (2–80 characters)");
  if (!VENUE_KINDS.includes(input.kind as VenueKind)) throw new OnboardingError("Choose what kind of venue it is");
  const town = String(input.town ?? "").trim().slice(0, 80);
  const tables = Number(input.tables);
  if (!Number.isInteger(tables) || tables < 0 || tables > MAX_TABLES) throw new OnboardingError(`Tables must be a whole number from 0 to ${MAX_TABLES}`);
  checkPasswordStrength(String(input.password ?? ""), [email, venueName]);
  if (input.acceptTerms !== true) throw new OnboardingError("Please accept the terms and the data processing agreement");
  return { email, ownerName, password: input.password, venueName, kind: input.kind as VenueKind, town, tables, exampleMenu: input.exampleMenu === true, acceptTerms: true };
}

const COMMON = ["password", "123456789", "qwertyuiop", "letmein", "welcome", "completepub", "1111111111"];
export function checkPasswordStrength(pw: string, personal: string[] = []) {
  if (pw.length < MIN_PASSWORD) throw new OnboardingError(`Use at least ${MIN_PASSWORD} characters for your password`);
  if (pw.length > 200) throw new OnboardingError("That password is too long");
  const low = pw.toLowerCase();
  if (COMMON.some((c) => low.includes(c)) || new Set(low).size < 5) throw new OnboardingError("That password is too easy to guess");
  if (personal.some((p) => p && p.length >= 4 && low.includes(p.toLowerCase().split("@")[0].replace(/\s+/g, ""))))
    throw new OnboardingError("Don't use your email or venue name in your password");
}

/** "MJ O'Connor's, Carrick" → "mj-oconnors-carrick". */
export function slugify(name: string): string {
  const s = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  return s.length >= 2 ? s : "venue";
}

/** Paths that a venue slug must never take over. */
export const RESERVED_SLUGS = new Set(["start", "api", "staff", "office", "admin", "app", "v", "venues", "login", "signup", "join", "help", "terms", "privacy", "www", "mcp"]);

/** Levels a new programme starts with; the venue can change them later. */
export function defaultLevels(): { name: string; minSpend12mCents: number; birthdayCreditCents: number; levelupPoints: number; doublePointsCount: number }[] {
  return [
    { name: "Member", minSpend12mCents: 0, birthdayCreditCents: 1000, levelupPoints: 0, doublePointsCount: 0 },
    { name: "Regular", minSpend12mCents: 30_000, birthdayCreditCents: 2000, levelupPoints: 1000, doublePointsCount: 0 },
    { name: "Insider", minSpend12mCents: 100_000, birthdayCreditCents: 3500, levelupPoints: 2000, doublePointsCount: 6 },
    { name: "Inner circle", minSpend12mCents: 300_000, birthdayCreditCents: 6000, levelupPoints: 3500, doublePointsCount: 12 },
  ];
}

/** Starter menu sections by kind of venue. */
export function defaultCategories(kind: VenueKind): string[] {
  switch (kind) {
    case "restaurant":
      return ["Starters", "Mains", "Desserts", "Drinks"];
    case "cafe":
      return ["Coffee & tea", "Cold drinks", "Food"];
    case "hotel":
      return ["Bar", "Food", "Soft & hot"];
    default:
      return ["Drinks", "Soft & hot", "Food"];
  }
}

export interface SetupState {
  emailVerified: boolean;
  activeItems: number;
  tables: number;
  paymentsReady: boolean;
  vatNumber: string;
  googlePlace: boolean;
  xeroConnected: boolean;
  staffCount: number;
}
export interface SetupStep {
  id: "account" | "menu" | "tables" | "payments" | "vat" | "reviews" | "xero" | "team";
  title: string;
  done: boolean;
  required: boolean;
  href: string;
}

/** What a venue must (and may) do before taking real orders. */
export function setupChecklist(s: SetupState, slug: string): { steps: SetupStep[]; canGoLive: boolean; missing: string[] } {
  const o = `/office/${slug}`;
  const steps: SetupStep[] = [
    { id: "account", title: "Create your account", done: s.emailVerified, required: true, href: o },
    { id: "menu", title: "Add your menu", done: s.activeItems > 0, required: true, href: `${o}/menu` },
    { id: "tables", title: "Set up tables and print QR codes", done: s.tables > 0, required: false, href: `${o}/tables` },
    { id: "payments", title: "Connect myPOS (or Revolut) so guests can pay you", done: s.paymentsReady, required: true, href: `${o}/settings` },
    { id: "vat", title: "Add your VAT number for receipts", done: /^IE\d[0-9A-Z+*]\d{5}[A-Z]{1,2}$/i.test(s.vatNumber.replace(/\s/g, "")), required: true, href: `${o}/settings#venue` },
    { id: "reviews", title: "Add your Google Place ID for reviews", done: s.googlePlace, required: false, href: `${o}/settings` },
    { id: "xero", title: "Connect Xero", done: s.xeroConnected, required: false, href: `${o}/settings` },
    { id: "team", title: "Add your staff", done: s.staffCount > 1, required: false, href: `${o}/team` },
  ];
  const missing = steps.filter((x) => x.required && !x.done).map((x) => x.title);
  return { steps, canGoLive: missing.length === 0, missing };
}

/**
 * Free trial in a billing month [from, to): the app fee only counts payments from `chargeFrom`,
 * and the subscription is charged for the share of the month after the trial (rounded half-up).
 */
export function trialAdjust(trialEndsAt: Date | null, from: Date, to: Date, monthlyFeeCents: number): { chargeFrom: Date; subscriptionCents: number } {
  const start = trialEndsAt && trialEndsAt > from ? trialEndsAt : from;
  if (start >= to) return { chargeFrom: to, subscriptionCents: 0 };
  const span = to.getTime() - from.getTime(), paid = to.getTime() - start.getTime();
  return { chargeFrom: start, subscriptionCents: Math.floor((2 * monthlyFeeCents * paid + span) / (2 * span)) };
}

/** Euro amount typed by a manager ("6.20", "6,20", "€6") → cents. */
export function parseEuro(input: string | number): number {
  const s = String(input ?? "").trim().replace("€", "").replace(",", ".");
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(s)) throw new OnboardingError("Enter a price like 6.20");
  return Math.round(Number(s) * 100);
}
