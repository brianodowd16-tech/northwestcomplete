import { localDate, zonedToUtc } from "@round/core";
import { myBookings } from "@round/db/growth";
import { BookTable, CancelBooking } from "@/components/BookTable";
import { currentGuest, loadVenue } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function Book({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ e?: string; t?: string; at?: string }> }) {
  const venue = await loadVenue((await params).slug);
  const sp = await searchParams;
  const guest = await currentGuest();
  const tz = venue.timezone;
  if (!venue.bookingSeatsPerSlot) return <div className="empty">{venue.name} doesn&apos;t take table bookings in the app. Just walk in, or give them a call.</div>;
  // Next 14 days, 12:00–21:30 every half hour, from 1 hour from now.
  const days = Array.from({ length: Math.min(14, venue.bookingMaxAdvanceDays) }, (_, i) => {
    const date = localDate(new Date(Date.now() + i * 86_400_000), tz);
    const slots = Array.from({ length: 20 }, (_, j) => {
      const hh = String(12 + Math.floor(j / 2)).padStart(2, "0"), mm = j % 2 ? "30" : "00";
      const at = zonedToUtc(`${date}T${hh}:${mm}`, tz);
      return { iso: at.toISOString(), label: `${hh}:${mm}` };
    }).filter((s) => new Date(s.iso).getTime() > Date.now() + 3_600_000);
    const label = i === 0 ? "Today" : i === 1 ? "Tomorrow" : new Date(`${date}T12:00:00Z`).toLocaleDateString("en-IE", { weekday: "short", day: "numeric", month: "short" });
    return { label, slots };
  }).filter((d) => d.slots.length);
  const at = sp.at ? new Date(sp.at) : null;
  // A game or event: offer the half hour before it starts.
  const eventIso = at && !Number.isNaN(at.getTime()) ? new Date(Math.floor((at.getTime() - 30 * 60_000) / 1_800_000) * 1_800_000).toISOString() : null;
  const event = sp.e && sp.t && eventIso ? { key: sp.e, title: sp.t.slice(0, 120), iso: eventIso } : null;
  const mine = guest ? await myBookings(venue, guest.id) : [];
  return (
    <div className="stack">
      <h1 style={{ fontSize: 26 }}>Book a table</h1>
      {mine.filter((b) => b.status === "confirmed").map((b) => (
        <div key={b.id} className="card row">
          <span>
            <b>{b.startsAt.toLocaleString("en-IE", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</b> · {b.partySize} {b.partySize === 1 ? "person" : "people"}
            {b.eventTitle && <span className="muted small"> · {b.eventTitle}</span>}
          </span>
          <CancelBooking slug={venue.slug} id={b.id} />
        </div>
      ))}
      <BookTable slug={venue.slug} days={days} event={event} signedIn={!!guest} />
      <p className="muted small" style={{ margin: 0 }}>Tables are held for 15 minutes. For groups over 20, call {venue.name}.</p>
    </div>
  );
}
