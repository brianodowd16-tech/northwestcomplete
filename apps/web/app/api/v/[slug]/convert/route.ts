import { convertMemberPoints, venueBySlug } from "@round/db/services";
import { currentGuest, errorJson, json } from "@/lib/server";

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const guest = await currentGuest();
    if (!guest) return json({ error: "Sign in first" }, 401);
    const venue = await venueBySlug((await ctx.params).slug);
    const { points } = (await req.json()) as { points?: number };
    await convertMemberPoints(venue, guest.id, Number(points));
    return json({ ok: true });
  } catch (e) {
    return errorJson(e);
  }
}
