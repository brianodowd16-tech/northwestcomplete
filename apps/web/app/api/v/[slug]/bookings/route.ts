import { cancelMyBooking, createBooking } from "@round/db/growth";
import { venueBySlug } from "@round/db/services";
import { currentGuest, errorJson, json } from "@/lib/server";

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const guest = await currentGuest();
    if (!guest) return json({ error: "Sign in first" }, 401);
    const venue = await venueBySlug((await ctx.params).slug);
    const b = (await req.json()) as { startsAt: string; partySize: number; note?: string; eventKey?: string; eventTitle?: string };
    const booking = await createBooking(venue, guest, { startsAt: new Date(b.startsAt), partySize: Number(b.partySize), note: b.note, eventKey: b.eventKey || null, eventTitle: b.eventTitle || null });
    return json({ id: booking.id });
  } catch (e) {
    return errorJson(e);
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const guest = await currentGuest();
    if (!guest) return json({ error: "Sign in first" }, 401);
    await cancelMyBooking(await venueBySlug((await ctx.params).slug), guest.id, new URL(req.url).searchParams.get("id") ?? "");
    return json({ ok: true });
  } catch (e) {
    return errorJson(e);
  }
}
