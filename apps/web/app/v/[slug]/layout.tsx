import { activeOrdersForCustomer, memberSummary } from "@round/db/services";
import Link from "next/link";
import { BottomNav } from "@/components/BottomNav";
import { VenueTheme } from "@/components/VenueTheme";
import { currentGuest, loadVenue } from "@/lib/server";

export default async function VenueLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const venue = await loadVenue((await params).slug);
  const guest = await currentGuest();
  const [summary, active] = guest ? await Promise.all([memberSummary(venue, guest.id), activeOrdersForCustomer(venue, guest.id)]) : [null, []];
  return (
    <div className="guest">
      <VenueTheme color={venue.brandColor} />
      <header className="ghead2">
        <Link className="vname" href={`/v/${venue.slug}`}>
          {venue.name}
        </Link>
        {summary ? (
          <Link className="modechip num" href={`/v/${venue.slug}/rewards`} aria-label="Your points">
            <i /> {summary.balances.points.toLocaleString("en-IE")} pts
          </Link>
        ) : (
          <Link className="btn sm" href={`/v/${venue.slug}/login`}>
            Sign in
          </Link>
        )}
      </header>
      {children}
      <BottomNav slug={venue.slug} activeOrders={active.length} />
    </div>
  );
}
