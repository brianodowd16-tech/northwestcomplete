import { songQueue } from "@round/db/songs";
import { SongQueue } from "@/components/SongQueue";
import { StaffNav } from "@/components/StaffNav";
import { VenueTheme } from "@/components/VenueTheme";
import { requireStaffFor } from "@/lib/server";

export const dynamic = "force-dynamic";

/** Song requests: paid ones from any guest and free ones from groups. Play them on the venue's own licensed system. */
export default async function Music({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { staff, venue } = await requireStaffFor(slug);
  const songs = JSON.parse(JSON.stringify(await songQueue(staff)));
  return (
    <div className="page stack" style={{ maxWidth: 760 }}>
      <VenueTheme color={venue.brandColor} />
      <div>
        <div className="label">{venue.name}</div>
        <StaffNav setup={venue.status === "setup"} slug={slug} current="music" admin={staff.role === "admin"} />
        <h1 style={{ fontSize: 26 }}>Song requests</h1>
      </div>
      {!venue.songRequests && !venue.songRequestCents && <div className="notice">Song requests are off. A manager can turn them on in Social.</div>}
      <SongQueue slug={slug} initial={songs} />
      <p className="muted small" style={{ margin: 0 }}>Paid requests show here and on the bar screen as soon as the payment clears. Declining one refunds the guest in full. Play requests on your own licensed system (for example Soundtrack, a DJ or a jukebox service). Public music in Ireland needs an IMRO/PPI licence, and personal Spotify accounts can&apos;t be used to play music in a venue.</p>
    </div>
  );
}
