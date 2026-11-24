import { activeOrdersForCustomer, memberSummary } from "@round/db/services";
import Link from "next/link";
import { BottomNav } from "@/components/BottomNav";
import { VenueTheme } from "@/components/VenueTheme";
import { InstallApp } from "@/components/InstallApp";
import { currentGuest, loadVenue } from "@/lib/server";
import type { Metadata, Viewport } from "next";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const venue = await loadVenue((await params).slug);
  return {
    title: venue.name,
    description: venue.tagline || `Order, pay and earn rewards at ${venue.name}`,
    manifest: `/v/${venue.slug}/manifest.webmanifest`,
    appleWebApp: { capable: true, title: venue.name, statusBarStyle: "default" },
    icons: { icon: `/api/icon/${venue.slug}/192`, apple: `/api/icon/${venue.slug}/180` },
  };
}

export async function generateViewport({ params }: { params: Promise<{ slug: string }> }): Promise<Viewport> {
  const venue = await loadVenue((await params).slug);
  return { themeColor: /^#[0-9a-fA-F]{6}$/.test(venue.brandColor) ? venue.brandColor : "#2b5a4a", width: "device-width", initialScale: 1, viewportFit: "cover" };
}

export default async function VenueLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const venue = await loadVenue((await params).slug);
  if (venue.status === "suspended")
    return (
      <div className="guest">
        <div className="empty" style={{ marginTop: 60 }}>
          {venue.name} isn&apos;t taking orders through the app right now. Please order at the bar.
        </div>
      </div>
    );
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
      {venue.status === "setup" && <div className="testmode">Test mode: {venue.name} isn&apos;t taking real payments yet. No money moves.</div>}
      {children}
      <InstallApp name={venue.name} />
      <BottomNav slug={venue.slug} activeOrders={active.length} />
    </div>
  );
}
