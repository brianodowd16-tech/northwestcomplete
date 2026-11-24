import { goLive } from "@round/db/onboarding";
import { venueBySlug } from "@round/db/services";
import { currentStaff, errorJson, json } from "@/lib/server";

export async function POST(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const staff = await currentStaff();
    const venue = await venueBySlug((await ctx.params).slug);
    if (!staff || staff.venueId !== venue.id || staff.role !== "admin") return json({ error: "Sign in as a manager" }, 401);
    await goLive(venue, staff);
    return json({ ok: true });
  } catch (e) {
    return errorJson(e);
  }
}
