import { songRequests } from "@round/db/groups";
import { ActionButton } from "@/components/ActionButton";
import { AutoRefresh } from "@/components/AutoRefresh";
import { StaffNav } from "@/components/StaffNav";
import { VenueTheme } from "@/components/VenueTheme";
import { requireStaffFor } from "@/lib/server";

export const dynamic = "force-dynamic";

/** Song requests from groups in tonight. Play them on the venue's own licensed music system. */
export default async function Music({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { staff, venue } = await requireStaffFor(slug);
  const songs = await songRequests(staff);
  const waiting = songs.filter((s) => s.status === "requested");
  return (
    <div className="page stack" style={{ maxWidth: 760 }}>
      <VenueTheme color={venue.brandColor} />
      <AutoRefresh seconds={20} />
      <div>
        <div className="label">{venue.name}</div>
        <StaffNav setup={venue.status === "setup"} slug={slug} current="music" admin={staff.role === "admin"} />
        <div className="row wrap"><h1 style={{ fontSize: 26 }}>Song requests</h1><span className="chip plain">{waiting.length} waiting</span></div>
      </div>
      {!venue.songRequests && <div className="notice">Song requests are off. A manager can turn them on in Social.</div>}
      {songs.length === 0 ? <div className="empty">No requests tonight. Groups out at {venue.name} can ask for songs from their group in the app.</div> : (
        <section className="panel">
          <table><tbody>
            {songs.map((s) => (
              <tr key={s.id} style={s.status !== "requested" ? { opacity: 0.55 } : undefined}>
                <td><b>{s.title}</b><div className="muted small">{s.createdAt.toLocaleTimeString("en-IE", { timeZone: venue.timezone, hour: "2-digit", minute: "2-digit" })}{s.link ? <> · <a href={s.link} target="_blank" rel="noopener noreferrer">Spotify link</a></> : null}</div></td>
                <td className="r">{s.status === "requested" ? (
                  <span className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                    <ActionButton url="/api/staff/songs" body={{ id: s.id, status: "played" }} label="Played" />
                    <ActionButton url="/api/staff/songs" body={{ id: s.id, status: "declined" }} label="Not tonight" ghost />
                  </span>
                ) : <span className={`chip ${s.status === "played" ? "ok" : "plain"}`}>{s.status === "played" ? "Played" : "Declined"}</span>}</td>
              </tr>
            ))}
          </tbody></table>
        </section>
      )}
      <p className="muted small" style={{ margin: 0 }}>Play requests on your own licensed system (for example Soundtrack, a DJ or a jukebox service). Public music in Ireland needs an IMRO/PPI licence, and personal Spotify accounts can&apos;t be used to play music in a venue.</p>
    </div>
  );
}
