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
  const tz = venue.timezone;
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
    </div>
  );
}
