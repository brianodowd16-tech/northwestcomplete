import { localDate } from "@round/core";
import { partnerBookings } from "@round/db/connect";
import { packages, venueParties } from "@round/db/parties";
import { PartyStaff } from "@/components/PartyStaff";
import { venueBookings } from "@round/db/growth";
import { ActionButton } from "@/components/ActionButton";
import { StaffNav } from "@/components/StaffNav";
import { VenueTheme } from "@/components/VenueTheme";
import { requireStaffFor } from "@/lib/server";

export const dynamic = "force-dynamic";

const STATUS = { confirmed: ["Booked", "plain"], seated: ["Seated", "ok"], no_show: ["No-show", "crit"], cancelled: ["Cancelled", "plain"] } as const;

export default async function Bookings({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { staff, venue } = await requireStaffFor(slug);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const list = await venueBookings(venue, start, new Date(start.getTime() + 2 * 86_400_000));
  const spa = await partnerBookings(venue, start, new Date(start.getTime() + 2 * 86_400_000));
  const tz = venue.timezone;
  const parties = await venueParties(venue, new Date(Date.now() - 6 * 3_600_000), new Date(Date.now() + 60 * 86_400_000));
  const pkgs = await packages(venue, { all: true });
  const covers = list.filter((b) => b.status !== "cancelled" && b.startsAt.getTime() < start.getTime() + 86_400_000).reduce((s, b) => s + b.partySize, 0);
  return (
    <div className="page stack" style={{ maxWidth: 900 }}>
      <VenueTheme color={venue.brandColor} />
      <div>
        <div className="label">{venue.name}</div>
        <StaffNav setup={venue.status === "setup"} slug={slug} current="bookings" admin={staff.role === "admin"} />
        <div className="row wrap">
          <h1 style={{ fontSize: 26 }}>Bookings</h1>
          <span className="chip plain num">{covers} covers today</span>
        </div>
      </div>
      {!venue.bookingSeatsPerSlot && <div className="notice">Bookings are off. A manager can turn them on under Integrations.</div>}
      {list.length === 0 ? (
        <div className="empty">No bookings today or tomorrow.</div>
      ) : (
        <section className="panel">
          <table>
            <tbody>
              {list.map((b) => (
                <tr key={b.id} style={{ opacity: b.status === "cancelled" ? 0.5 : 1 }}>
                  <td className="num"><b>{b.startsAt.toLocaleString("en-IE", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit" })}</b></td>
                  <td>
                    <b>{b.guest.name}</b> · {b.partySize}
                    <div className="muted small">{[b.eventTitle, b.note, b.guest.phone].filter(Boolean).join(" · ")}</div>
                  </td>
                  <td><span className={`chip ${STATUS[b.status][1]}`}>{STATUS[b.status][0]}</span></td>
                  <td className="r">
                    {b.status === "confirmed" && (
                      <div className="row" style={{ justifyContent: "flex-end" }}>
                        <ActionButton url={`/api/staff/bookings/${b.id}`} body={{ status: "seated" }} label="Seated" />
                        <ActionButton url={`/api/staff/bookings/${b.id}`} body={{ status: "no_show" }} label="No-show" ghost />
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <PartyStaff
        admin={staff.role === "admin"}
        today={localDate(new Date(), tz)}
        packages={pkgs.map((p) => ({ id: p.id, name: p.name, description: p.description, pricePerPersonCents: p.pricePerPersonCents, minGuests: p.minGuests, maxGuests: p.maxGuests, depositPerPersonCents: p.depositPerPersonCents, vatRate: p.vatRate, minNoticeDays: p.minNoticeDays, active: p.active }))}
        parties={parties.map((b) => ({ id: b.id, packageName: b.packageName, contactName: b.contactName, contactPhone: b.contactPhone, occasion: b.occasion, notes: b.notes, guests: b.guests, totalCents: b.totalCents, depositCents: b.depositCents, status: b.status, source: b.staffId ? "staff" : "app", when: b.startsAt.toLocaleString("en-IE", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) }))}
      />
      {spa.length > 0 && (
        <section className="panel">
          <h3>Spa and activities (Trybe)</h3>
          <table><tbody>
            {spa.map((b) => (
              <tr key={b.id}>
                <td className="num">{b.startsAt?.toLocaleString("en-IE", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit" })}</td>
                <td><b>{b.guestName}</b><div className="muted small">{b.items.join(", ")}{b.ref ? ` · ${b.ref}` : ""}</div></td>
              </tr>
            ))}
          </tbody></table>
        </section>
      )}
    </div>
  );
}
