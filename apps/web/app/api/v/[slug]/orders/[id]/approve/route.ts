import { approveHeldOrder, venueBySlug } from "@round/db/services";
import { appUrl, currentGuest, errorJson, json, providerFor } from "@/lib/server";

/** The guest approves an order their AI assistant prepared. */
export async function POST(_req: Request, ctx: { params: Promise<{ slug: string; id: string }> }) {
  try {
    const guest = await currentGuest();
    if (!guest) return json({ error: "Sign in first" }, 401);
    const { slug, id } = await ctx.params;
    const venue = await venueBySlug(slug);
    const { order, checkout } = await approveHeldOrder(venue, guest, id, await providerFor(venue), appUrl());
    return json({ orderId: order.id, status: order.status, amountCents: order.amountPaidCents, checkout: checkout && { ...checkout, mode: process.env.REVOLUT_MODE === "prod" ? "prod" : "sandbox" } });
  } catch (e) {
    return errorJson(e);
  }
}
