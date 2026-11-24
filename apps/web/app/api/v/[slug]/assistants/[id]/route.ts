import { revokeGrant } from "@round/db/ai";
import { venueBySlug } from "@round/db/services";
import { currentGuest, errorJson, json } from "@/lib/server";

/** The guest switches an assistant off. Its token stops working immediately. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ slug: string; id: string }> }) {
  try {
    const guest = await currentGuest();
    if (!guest) return json({ error: "Sign in first" }, 401);
    const { slug, id } = await ctx.params;
    await revokeGrant(await venueBySlug(slug), guest.id, id);
    return json({ ok: true });
  } catch (e) {
    return errorJson(e);
  }
}
