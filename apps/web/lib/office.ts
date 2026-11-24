import "server-only";
import { venueBySlug, type Staff, type Venue } from "@round/db/services";
import { currentStaff, json } from "./server";

/** For office API routes: the signed-in manager of this venue, or a 401 response. */
export async function managerFor(slug: string): Promise<{ staff: Staff; venue: Venue } | Response> {
  const staff = await currentStaff();
  const venue = await venueBySlug(slug);
  if (!staff || staff.venueId !== venue.id || staff.role !== "admin") return json({ error: "Sign in as a manager" }, 401);
  return { staff, venue };
}
