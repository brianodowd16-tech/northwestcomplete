import Link from "next/link";
import { VenueTheme } from "@/components/VenueTheme";
import { currentGuest, loadVenue } from "@/lib/server";

export default async function VenueLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const venue = await loadVenue((await params).slug);
  const guest = await currentGuest();
  return (
    <div className="guest">
      <VenueTheme color={venue.brandColor} />
      <header className="ghead">
        <Link href={`/v/${venue.slug}`} style={{ textDecoration: "none" }}>
          <b>{venue.name}</b>
        </Link>
        <nav className="row small">
          <Link href={`/v/${venue.slug}/rewards`}>Rewards</Link>
          {!guest && <Link href={`/v/${venue.slug}/login`}>Sign in</Link>}
        </nav>
      </header>
      {children}
    </div>
  );
}
