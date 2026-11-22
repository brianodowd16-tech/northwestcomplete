import { venueBySlug } from "@round/db/services";
import { reviewRedirect } from "@round/db/integrations";
import { currentGuest } from "@/lib/server";

// Records the click, then sends the guest to Google's own review form.
export async function GET(req: Request, ctx: { params: Promise<{ slug: string; orderId: string }> }) {
  const { slug, orderId } = await ctx.params;
  const guest = await currentGuest();
  if (!guest) return Response.redirect(new URL(`/v/${slug}`, req.url), 303);
  try {
    const url = await reviewRedirect(await venueBySlug(slug), orderId, guest.id);
    return Response.redirect(url, 303);
  } catch {
    return Response.redirect(new URL(`/v/${slug}`, req.url), 303);
  }
}
