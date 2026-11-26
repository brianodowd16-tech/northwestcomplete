import { venueSnapshot } from "@round/db/ai";
import { venueBySlug } from "@round/db/services";
import { managerBriefing } from "@round/db/briefing";
import { askVenueAssistant, assistantConfigured, briefVenue, type ChatTurn } from "@/lib/assistant";
import { allow } from "@/lib/ratelimit";
import { currentStaff, errorJson, json } from "@/lib/server";

/** Managers ask questions about their own venue's numbers. */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const staff = await currentStaff();
    const venue = await venueBySlug((await ctx.params).slug);
    if (!staff || staff.venueId !== venue.id || staff.role !== "admin") return json({ error: "Managers only" }, 403);
    if (!assistantConfigured()) return json({ error: "The AI assistant isn't set up on the server yet (ANTHROPIC_API_KEY)." }, 400);
    const b = (await req.json()) as { question?: string; turns?: ChatTurn[]; action?: string };
    if (!(await allow(`assistant:${staff.id}`, 30, 10 * 60_000))) return json({ error: "That's a lot of questions. Give it a few minutes." }, 429);
    const { facts } = await managerBriefing(venue, staff);
    if (b.action === "brief") {
      const r = await briefVenue(venue.id, facts);
      return json(r, r.ok ? 200 : 400);
    }
    const r = await askVenueAssistant(Array.isArray(b.turns) ? b.turns : String(b.question ?? ""), { ...(await venueSnapshot(venue)), right_now: facts });
    return json(r, r.ok ? 200 : 400);
  } catch (e) {
    return errorJson(e);
  }
}
