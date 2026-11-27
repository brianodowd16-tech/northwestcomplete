import { mySongs, requestPaidSong } from "@round/db/songs";
import { venueBySlug } from "@round/db/services";
import { appUrl, currentGuest, errorJson, json, providerFor } from "@/lib/server";

/** The price of a song request here and the guest's own requests tonight. */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const venue = await venueBySlug((await ctx.params).slug);
    const guest = await currentGuest();
    return json({ priceCents: venue.songRequestCents, mine: guest ? await mySongs(venue, guest.id) : [] });
  } catch (e) {
    return errorJson(e);
  }
}

/** A paid song request: opens the venue's checkout; the bar sees it once the payment is verified. */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const guest = await currentGuest();
    if (!guest) return json({ error: "Sign in to request a song" }, 401);
    const venue = await venueBySlug((await ctx.params).slug);
    const b = (await req.json()) as { title?: string; link?: string; idempotencyKey?: string };
    const { order, checkout } = await requestPaidSong(venue, guest, { title: String(b.title ?? ""), link: b.link ? String(b.link) : undefined, idempotencyKey: `${guest.id}:${String(b.idempotencyKey ?? "")}` }, await providerFor(venue), appUrl());
    return json({ orderId: order.id, status: order.status, amountCents: order.amountPaidCents, checkout: checkout && { ...checkout, mode: process.env.REVOLUT_MODE === "prod" ? "prod" : "sandbox" } });
  } catch (e) {
    return errorJson(e);
  }
}
