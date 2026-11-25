import { verifySession } from "@round/core";
import { connectSage } from "@round/db/integrations";
import { venueById } from "@round/db/services";
import { cookies } from "next/headers";
import { currentStaff, secretsKey, sessionSecret, sageApp } from "@/lib/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const jar = await cookies();
  const state = url.searchParams.get("state") ?? "";
  const expected = jar.get("round_sage_state")?.value;
  jar.delete("round_sage_state");
  const venueId = state && state === expected ? verifySession(state, "sage", sessionSecret()) : null;
  const staff = await currentStaff();
  const app = sageApp();
  const key = secretsKey();
  if (!venueId || !staff || staff.venueId !== venueId || staff.role !== "admin" || !app || !key) return new Response("This Sage sign-in link has expired. Try again from Integrations.", { status: 400 });
  const venue = await venueById(venueId);
  const back = (q: string) => Response.redirect(new URL(`/office/${venue.slug}/integrations?${q}`, req.url), 303);
  const code = url.searchParams.get("code");
  if (!code) return back("sage=cancelled");
  try {
    await connectSage(venue, app, code, key);
    return back("sage=connected");
  } catch (e) {
    console.error("sage connect", e);
    return back("sage=failed");
  }
}
