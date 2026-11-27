import { localDate } from "@round/core";
import { myParties, packages } from "@round/db/parties";
import { ActionButton } from "@/components/ActionButton";
import { eur } from "@/components/format";
import { PartyBook } from "@/components/PartyBook";
import { currentGuest, loadVenue } from "@/lib/server";

export const dynamic = "force-dynamic";

const STATUS: Record<string, [string, string]> = { pending_payment: ["Waiting for payment", "plain"], requested: ["Waiting for the venue", "warn"], confirmed: ["Confirmed", "ok"], declined: ["Declined, refunded", "plain"], cancelled: ["Cancelled", "plain"] };

/** Parties and groups: book a package (e.g. €30 a head, 20 people minimum). */
export default async function Party({ params }: { params: Promise<{ slug: string }> }) {
  const venue = await loadVenue((await params).slug);
  const guest = await currentGuest();
  const pk = await packages(venue);
  const mine = guest ? await myParties(venue, guest.id) : [];
  const minNotice = Math.min(...pk.map((p) => p.minNoticeDays), 30);
  return (
    <div className="stack">
      <h1 style={{ fontSize: 26 }}>Parties and groups</h1>
      {mine.length > 0 && (
        <section className="stack" style={{ gap: 8 }}>
          {mine.map((b) => (
            <div key={b.id} className="card">
              <div className="row"><b>{b.packageName} · {b.guests} people</b><span className={`chip ${STATUS[b.status]?.[1] ?? "plain"}`}>{STATUS[b.status]?.[0] ?? b.status}</span></div>
              <span className="small">{b.startsAt.toLocaleString("en-IE", { timeZone: venue.timezone, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}{b.occasion ? ` · ${b.occasion}` : ""}</span>
              <span className="muted small">Total {eur(b.totalCents)}{b.depositCents ? ` · deposit ${eur(b.depositCents)} paid` : ""}</span>
              {b.status === "requested" && <ActionButton url={`/api/v/${venue.slug}/parties`} body={{ action: "cancel", id: b.id }} label="Cancel request" ghost confirmText="Cancel this request? Any deposit is refunded." />}
            </div>
          ))}
        </section>
      )}
      {pk.length === 0 ? (
        <div className="empty">{venue.name} hasn&apos;t listed party packages yet. Give them a call.</div>
      ) : (
        <PartyBook slug={venue.slug} signedIn={!!guest} minDate={localDate(new Date(Date.now() + minNotice * 86_400_000), venue.timezone)} packages={pk.map((p) => ({ id: p.id, name: p.name, description: p.description, pricePerPersonCents: p.pricePerPersonCents, minGuests: p.minGuests, maxGuests: p.maxGuests, depositPerPersonCents: p.depositPerPersonCents, minNoticeDays: p.minNoticeDays }))} />
      )}
    </div>
  );
}
