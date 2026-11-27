import { zonedToUtc } from "@round/core";
import { savePackage, setPartyStatus, staffBookParty } from "@round/db/parties";
import { venueById } from "@round/db/services";
import { currentStaff, errorJson, json, providerFor } from "@/lib/server";

/**
 * Staff: { action: "book", packageId, date, time, guests, contactName, contactPhone?, contactEmail?, occasion?, notes? }
 * or { action: "status", id, to: confirmed | declined | cancelled | completed }.
 * Managers: { action: "package", id?, name, description, price, minGuests, maxGuests, deposit, vatRate, minNoticeDays, active }.
 */
export async function POST(req: Request) {
  try {
    const staff = await currentStaff();
    if (!staff) return json({ error: "Sign in" }, 401);
    const venue = await venueById(staff.venueId);
    const b = (await req.json()) as Record<string, string>;
    const euros = (v: unknown) => Math.round(Number(String(v ?? "0").replace(",", ".")) * 100);
    switch (b.action) {
      case "book": {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date) || !/^\d{2}:\d{2}$/.test(b.time)) return json({ error: "Choose a date and time" }, 400);
        await staffBookParty(staff, venue, { packageId: b.packageId, startsAt: zonedToUtc(`${b.date}T${b.time}`, venue.timezone), guests: Number(b.guests), contactName: b.contactName, contactPhone: b.contactPhone, contactEmail: b.contactEmail, occasion: b.occasion, notes: b.notes });
        return json({ message: "Party booked" });
      }
      case "status": {
        const to = (["confirmed", "declined", "cancelled", "completed"] as const).find((x) => x === b.to);
        if (!to) return json({ error: "Bad request" }, 400);
        const r = await setPartyStatus(staff, venue, String(b.id ?? ""), to, await providerFor(venue));
        return json({ message: { confirmed: "Confirmed", declined: "Declined", cancelled: "Cancelled", completed: "Marked done" }[to] + (r.refunded ? " and the deposit refunded" : "") });
      }
      case "package": {
        if (staff.role !== "admin") return json({ error: "Managers only" }, 403);
        await savePackage(venue, { name: b.name, description: b.description, pricePerPersonCents: euros(b.price), minGuests: Number(b.minGuests), maxGuests: Number(b.maxGuests || 200), depositPerPersonCents: euros(b.deposit), vatRate: b.vatRate === "23" ? 23 : 9, minNoticeDays: Number(b.minNoticeDays ?? 2), active: b.active === "on" || b.active === "true" }, b.id || undefined);
        return json({ message: "Package saved" });
      }
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return errorJson(e);
  }
}
