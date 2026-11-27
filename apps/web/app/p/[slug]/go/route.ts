import { countSponsor, sponsorBySlug } from "@round/db/sponsors";
import { NextResponse } from "next/server";

/** A click on a sponsor's card: counted once here, then on to the sponsor's page. */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const slug = (await ctx.params).slug;
  const from = new URL(req.url).searchParams.get("from") ?? "other";
  const s = await sponsorBySlug(slug).catch(() => null);
  if (!s) return new NextResponse("Not found", { status: 404 });
  await countSponsor(s.id, from, "clicks").catch(() => {});
  return NextResponse.redirect(new URL(`/p/${slug}`, req.url), 303);
}
