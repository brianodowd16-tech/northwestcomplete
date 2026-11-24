import { openTabs, recentTillSales } from "@round/db/till";
import { menu } from "@round/db/services";
import Link from "next/link";
import { StaffNav } from "@/components/StaffNav";
import { Till } from "@/components/Till";
import { VenueTheme } from "@/components/VenueTheme";
import { requireStaffFor } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function TillPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { staff, venue } = await requireStaffFor(slug);
  const [cats, recent, tabs] = await Promise.all([menu(venue), recentTillSales(venue), openTabs(venue)]);
  return (
    <div className="page">
      <VenueTheme color={venue.brandColor} />
      <div className="label">{venue.name}</div>
      <StaffNav setup={venue.status === "setup"} slug={slug} current="till" admin={staff.role === "admin"} />
      <div className="row" style={{ marginBottom: 10 }}>
        <h1 style={{ fontSize: 24 }}>Till</h1>
        <Link className="btn sm ghost" href={`/staff/${slug}/till/report`}>End of day</Link>
      </div>
      <Till
        cats={cats.map((c) => ({ id: c.id, name: c.name, items: c.items.map((i) => ({ id: i.id, name: i.name, priceCents: i.priceCents, station: i.station, soldOut: i.soldOut })) }))}
        recent={JSON.parse(JSON.stringify(recent))}
        canRefundAll={staff.role === "admin"}
        hotel={venue.kind === "hotel"}
        tabs={JSON.parse(JSON.stringify(tabs))}
      />
    </div>
  );
}
