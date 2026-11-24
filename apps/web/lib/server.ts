import "server-only";
import { signSession, verifySession, type PaymentProvider, type XeroApp } from "@round/core";
import { providerForVenue } from "@round/db/integrations";
import { customerById, staffById, venueById, venueBySlug, NotFound, type Customer, type Staff, type Venue } from "@round/db/services";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

export function sessionSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET must be set (16+ chars)");
  return s;
}

/** Public base URL, used for payment return/notify URLs and the Xero redirect. */
export function appUrl(): string {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

/** Key that encrypts venue credentials. Required once any venue uses live keys or Xero. */
export function secretsKey(): string | undefined {
  return process.env.SECRETS_KEY || undefined;
}

/** The venue's own payment provider (myPOS, Revolut, or test payments). */
export function providerFor(venue: Venue): Promise<PaymentProvider> {
  return providerForVenue(venue, secretsKey());
}

export function xeroApp(): XeroApp | null {
  const { XERO_CLIENT_ID: clientId, XERO_CLIENT_SECRET: clientSecret } = process.env;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri: `${appUrl()}/api/xero/callback`, scopes: process.env.XERO_SCOPES };
}

const GUEST_COOKIE = "round_guest";
const STAFF_COOKIE = "round_staff";
const GUEST_TTL = 90 * 86_400_000;
const STAFF_TTL = 14 * 3_600_000;

const cookieOpts = (ttl: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: ttl / 1000,
});

export async function startGuestSession(customerId: string) {
  (await cookies()).set(GUEST_COOKIE, signSession("guest", customerId, sessionSecret(), GUEST_TTL), cookieOpts(GUEST_TTL));
}

export async function startStaffSession(staffId: string) {
  (await cookies()).set(STAFF_COOKIE, signSession("staff", staffId, sessionSecret(), STAFF_TTL), cookieOpts(STAFF_TTL));
}

export async function endSessions() {
  const c = await cookies();
  c.delete(GUEST_COOKIE);
  c.delete(STAFF_COOKIE);
}

export async function currentGuest(): Promise<Customer | null> {
  const id = verifySession((await cookies()).get(GUEST_COOKIE)?.value, "guest", sessionSecret());
  return id ? customerById(id) : null;
}

export async function currentStaff(): Promise<Staff | null> {
  const id = verifySession((await cookies()).get(STAFF_COOKIE)?.value, "staff", sessionSecret());
  return id ? staffById(id) : null;
}

/** Staff signed in and belonging to this venue; redirects to login otherwise. */
export async function requireStaffFor(slug: string, opts: { admin?: boolean } = {}): Promise<{ staff: Staff; venue: Venue }> {
  const staff = await currentStaff();
  if (!staff) redirect(`/staff/login?next=${encodeURIComponent(`/staff/${slug}/bar`)}`);
  if (staff.mustChangePassword) redirect("/staff/password");
  const venue = await loadVenue(slug);
  // Signed in for another venue: send them to their own screens and say why.
  if (staff.venueId !== venue.id) redirect(`/staff/${(await venueById(staff.venueId)).slug}/bar?other=${encodeURIComponent(venue.name)}`);
  if (opts.admin && staff.role !== "admin") notFound();
  return { staff, venue };
}

export async function loadVenue(slug: string): Promise<Venue> {
  try {
    return await venueBySlug(slug);
  } catch (e) {
    if (e instanceof NotFound) notFound();
    throw e;
  }
}

export function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

export function errorJson(e: unknown) {
  const name = e instanceof Error ? e.constructor.name : "";
  const status = name === "NotFound" ? 404 : name === "Forbidden" ? 403 : ["CartError", "LoyaltyError", "SignupError", "DocketError", "OnboardingError", "InventoryError", "EventError"].includes(name) ? 400 : 500;
  if (status === 500) console.error(e);
  return json({ error: status === 500 ? "Something went wrong" : (e as Error).message }, status);
}
