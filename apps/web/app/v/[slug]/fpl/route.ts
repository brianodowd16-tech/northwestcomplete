import { fplJoinUrl } from "@round/core";
import { countFplClick } from "@round/db/events";
import { venueBySlug } from "@round/db/services";

/** The venue's shareable link to join its Fantasy Premier League mini-league (for posters, socials, QR codes). */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const v = await venueBySlug((await ctx.params).slug).catch(() => null);
  if (!v?.fplCode || v.status === "suspended") return new Response("This venue doesn't have a fantasy league yet.", { status: 404 });
  await countFplClick(v).catch(() => {});
  return Response.redirect(fplJoinUrl(v.fplCode), 302);
}
