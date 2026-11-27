import { songQueue } from "@round/db/songs";
import { stationDockets } from "@round/db/services";
import { notFound } from "next/navigation";
import { DocketBoard, type DocketView } from "@/components/DocketBoard";
import { PauseControl } from "@/components/PauseControl";
import { SongQueue } from "@/components/SongQueue";
import { StaffNav } from "@/components/StaffNav";
import { VenueTheme } from "@/components/VenueTheme";
import { requireStaffFor } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function StationPage({ params, searchParams }: { params: Promise<{ slug: string; station: string }>; searchParams: Promise<{ other?: string }> }) {
  const { slug, station } = await params;
  if (station !== "bar" && station !== "kitchen") notFound();
  const { staff, venue } = await requireStaffFor(slug);
  // Rendered with the first dockets in place, so the board never flashes empty.
  const initial = JSON.parse(JSON.stringify(await stationDockets(staff, station))) as DocketView[];
  const songs = station === "bar" ? JSON.parse(JSON.stringify(await songQueue(staff))) : null;
  return (
    <div className="page">
      <VenueTheme color={venue.brandColor} />
      <div className="label">{venue.name}</div>
      <StaffNav setup={venue.status === "setup"} slug={slug} current={station} admin={staff.role === "admin"} other={(await searchParams).other} />
      <PauseControl station={station} until={venue.pausedUntil?.[station] ?? null} />
      {songs && <SongQueue slug={slug} initial={songs} compact />}
      <DocketBoard slug={slug} station={station} initial={initial} />
    </div>
  );
}
