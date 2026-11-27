import { zonedToUtc } from "@round/core";
import { cancelMyParty, myParties, packages, requestParty } from "@round/db/parties";
import { venueBySlug } from "@round/db/services";
import { appUrl, currentGuest, errorJson, json, providerFor } from "@/lib/server";

/** The venue's party packages and the guest's own party bookings. */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const venue = await venueBySlug((await ctx.params).slug);
    const guest = await currentGuest();
    return json({ packages: await packages(venue), mine: guest ? await myParties(venue, guest.id) : [] });
  } catch (e) {
    return errorJson(e);
  }
}

/**
 * { packageId, date: "YYYY-MM-DD", time: "HH:MM" (venue local), guests, occasion?, notes?, idempotencyKey }
 * or { action: "cancel", id }. A deposit opens the venue's own checkout.
 */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const guest = await currentGuest();
    if (!guest) return json({ error: "Sign in to book" }, 401);
    const venue = await venueBySlug((await ctx.params).slug);
    const b = (await req.json()) as Record<string, string | number>;
    if (b.action === "cancel") {
      await cancelMyParty(venue, guest, String(b.id ?? ""), await providerFor(venue));
      return json({ ok: true, message: "Cancelled" });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.date)) || !/^\d{2}:\d{2}$/.test(String(b.time))) return json({ error: "Choose a date and time" }, 400);
    const r = await requestParty(
      venue,
      guest,
      { packageId: String(b.packageId ?? ""), startsAt: zonedToUtc(`${b.date}T${b.time}`, venue.timezone), guests: Number(b.guests), occasion: String(b.occasion ?? ""), notes: String(b.notes ?? ""), idempotencyKey: `${guest.id}:${String(b.idempotencyKey ?? "")}` },
      await providerFor(venue),
      appUrl(),
    );
    return json({ bookingId: r.booking.id, status: r.booking.status, orderId: r.orderId, checkout: r.checkout && { ...r.checkout, mode: process.env.REVOLUT_MODE === "prod" ? "prod" : "sandbox" } });
  } catch (e) {
    return errorJson(e);
  }
}
