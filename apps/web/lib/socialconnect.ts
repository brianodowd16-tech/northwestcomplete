import "server-only";
import { googleAuthorizeUrl, googleLocations, metaAuthorizeUrl, metaPages, pickLocation, signSession, verifySession } from "@round/core";
import { connectGoogleBusiness, connectMeta } from "@round/db/social";
import { venueById, venueBySlug } from "@round/db/services";
import { cookies } from "next/headers";
import { currentStaff, googleApp, metaApp, secretsKey, sessionSecret } from "./server";

/** Starts "Connect Facebook and Instagram" or "Connect Google" for a venue's manager. */
export async function startConnect(req: Request, kind: "meta" | "google") {
  const slug = new URL(req.url).searchParams.get("venue") ?? "";
  const staff = await currentStaff();
  const venue = await venueBySlug(slug).catch(() => null);
  if (!staff || !venue || staff.venueId !== venue.id || staff.role !== "admin") return new Response("Managers only", { status: 403 });
  const app = kind === "meta" ? metaApp() : googleApp();
  if (!app) return new Response(`${kind === "meta" ? "Facebook" : "Google"} isn't configured on the server`, { status: 400 });
  const state = signSession(kind, venue.id, sessionSecret(), 10 * 60_000);
  (await cookies()).set(`round_${kind}_state`, state, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600, secure: process.env.NODE_ENV === "production" });
  return Response.redirect(kind === "meta" ? metaAuthorizeUrl(app, state) : googleAuthorizeUrl(app, state), 302);
}

/** Back from Facebook or Google: stores the venue's Page/Instagram or Business Profile location, encrypted. */
export async function finishConnect(req: Request, kind: "meta" | "google") {
  const url = new URL(req.url);
  const jar = await cookies();
  const state = url.searchParams.get("state") ?? "";
  const expected = jar.get(`round_${kind}_state`)?.value;
  jar.delete(`round_${kind}_state`);
  const venueId = state && state === expected ? verifySession(state, kind, sessionSecret()) : null;
  const staff = await currentStaff();
  const app = kind === "meta" ? metaApp() : googleApp();
  const key = secretsKey();
  if (!venueId || !staff || staff.venueId !== venueId || staff.role !== "admin" || !app || !key) return new Response("This sign-in link has expired. Try again from Social.", { status: 400 });
  const venue = await venueById(venueId);
  const back = (q: string) => Response.redirect(new URL(`/office/${venue.slug}/social?${q}`, req.url), 303);
  const code = url.searchParams.get("code");
  if (!code) return back(`${kind}=cancelled`);
  try {
    if (kind === "meta") {
      const pages = await metaPages(app, code);
      const pick = pickLocation(pages.map((p) => ({ location: p.pageId, title: p.pageName })), venue.name);
      const page = pages.find((p) => p.pageId === pick?.location);
      if (!page) return back("meta=nopage");
      await connectMeta(venue, page, page.pageToken, key);
    } else {
      const { refreshToken, locations } = await googleLocations(app, code);
      const loc = pickLocation(locations, venue.name);
      if (!loc) return back("google=nolocation");
      await connectGoogleBusiness(venue, loc, refreshToken, key);
    }
    return back(`${kind}=connected`);
  } catch (e) {
    console.error(`${kind} connect`, e);
    return back(`${kind}=failed`);
  }
}
