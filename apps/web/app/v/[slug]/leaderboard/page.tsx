import { leaderboard } from "@round/db/groups";
import Link from "next/link";
import { Leaderboard } from "@/components/Leaderboard";
import { currentGuest, loadVenue } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function VenueLeaderboard({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ metric?: string; period?: string }> }) {
  const venue = await loadVenue((await params).slug);
  const sp = await searchParams;
  const metric = sp.metric === "spend" ? "spend" : "points", period = sp.period === "all" ? "all" : "month";
  const guest = await currentGuest();
  const board = await leaderboard({ kind: "venue", slug: venue.slug }, metric, period, guest?.id);
  return (
    <div className="stack">
      <Leaderboard title={`${venue.name} leaderboard`} board={board} metric={metric} period={period} base={`/v/${venue.slug}/leaderboard`} guest={guest ? { optIn: guest.leaderboardOptIn, name: guest.leaderboardName ?? guest.name.split(" ")[0] } : null} />
      <div className="row wrap" style={{ justifyContent: "flex-start", gap: 6 }}>
        {venue.county && <Link className="btn sm ghost" href={`/leaderboards?county=${encodeURIComponent(venue.county)}`}>Co. {venue.county}</Link>}
        <Link className="btn sm ghost" href={`/leaderboards?country=${venue.country}`}>All of {venue.country === "IE" ? "Ireland" : venue.country}</Link>
      </div>
    </div>
  );
}
