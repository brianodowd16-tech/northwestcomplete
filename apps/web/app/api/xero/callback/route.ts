import { verifySession } from "@round/core";
import { connectXero } from "@round/db/integrations";
import { venueById } from "@round/db/services";
import { cookies } from "next/headers";
import { currentStaff, secretsKey, sessionSecret, xeroApp } from "@/lib/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const jar = await cookies();
  const state = url.searchParams.get("state") ?? "";
  const expected = jar.get("round_xero_state")?.value;
  jar.delete("round_xero_state");
  const venueId = state && state === expected ? verifySession(state, "xero", sessionSecret()) : null;
  const staff = await currentStaff();
  const app = xeroApp();
  const key = secretsKey();
  if (!venueId || !staff || staff.venueId !== venueId || staff.role !== "admin" || !app || !key) return new Response("This Xero sign-in link has expired. Try again from Settings.", { status: 400 });
  const venue = await venueById(venueId);
  const back = (q: string) => Response.redirect(new URL(`/office/${venue.slug}/settings?${q}`, req.url), 303);
  const code = url.searchParams.get("code");
  if (!code) return back("xero=cancelled");
  try {
    await connectXero(venue, app, code, key);
    return back("xero=connected");
  } catch (e) {
    console.error("xero connect", e);
    return back("xero=failed");
  }
}
