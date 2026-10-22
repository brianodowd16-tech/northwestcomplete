import "server-only";
import { providerFromEnv, signSession, verifySession, type PaymentProvider } from "@round/core";
import { customerById, staffById, venueBySlug, NotFound, type Customer, type Staff, type Venue } from "@round/db/services";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

export function sessionSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET must be set (16+ chars)");
  return s;
}

const g = globalThis as { __roundProvider?: PaymentProvider };
export function paymentProvider(): PaymentProvider {
  g.__roundProvider ??= providerFromEnv(process.env);
  return g.__roundProvider;
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
  const venue = await loadVenue(slug);
  if (staff.venueId !== venue.id) redirect("/staff/login?wrong=1");
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
  const status = name === "NotFound" ? 404 : name === "Forbidden" ? 403 : ["CartError", "LoyaltyError", "SignupError", "DocketError"].includes(name) ? 400 : 500;
  if (status === 500) console.error(e);
  return json({ error: status === 500 ? "Something went wrong" : (e as Error).message }, status);
}
