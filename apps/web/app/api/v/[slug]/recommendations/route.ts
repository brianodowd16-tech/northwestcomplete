import { recommendationsFor } from "@round/db/ai";
import { venueBySlug } from "@round/db/services";
import { currentGuest, errorJson, json } from "@/lib/server";

export const dynamic = "force-dynamic";

/** Menu suggestions for the current basket: your usual, goes with, popular here. */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const venue = await venueBySlug((await ctx.params).slug);
    const guest = await currentGuest();
    const basket = (new URL(req.url).searchParams.get("basket") ?? "").split(",").filter(Boolean).slice(0, 50);
    const recs = await recommendationsFor(venue, guest?.id ?? null, basket);
    return json({ recommendations: recs.map((r) => ({ itemId: r.itemId, reason: r.reason, withName: r.withName })) });
  } catch (e) {
    return errorJson(e);
  }
}
