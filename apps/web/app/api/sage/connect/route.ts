import { signSession, sageAuthorizeUrl } from "@round/core";
import { venueBySlug } from "@round/db/services";
import { cookies } from "next/headers";
import { currentStaff, sessionSecret, sageApp } from "@/lib/server";

// Starts "Connect to Sage" for a venue. The signed state ties the callback to this manager and venue.
export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("venue") ?? "";
  const staff = await currentStaff();
  const venue = await venueBySlug(slug).catch(() => null);
  const app = sageApp();
  if (!staff || !venue || staff.venueId !== venue.id || staff.role !== "admin") return new Response("Managers only", { status: 403 });
  if (!app) return new Response("Sage isn't configured on the server", { status: 400 });
  const state = signSession("sage", venue.id, sessionSecret(), 10 * 60_000);
  (await cookies()).set("round_sage_state", state, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600, secure: process.env.NODE_ENV === "production" });
  return Response.redirect(sageAuthorizeUrl(app, state), 302);
}
