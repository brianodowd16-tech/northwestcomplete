import { menu } from "@round/db/services";
import { SoldOutBoard } from "@/components/SoldOutBoard";
import { StaffNav } from "@/components/StaffNav";
import { VenueTheme } from "@/components/VenueTheme";
import { requireStaffFor } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function MenuPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { staff, venue } = await requireStaffFor(slug);
  const categories = await menu(venue);
  return (
    <div className="page">
      <VenueTheme color={venue.brandColor} />
      <div className="label">{venue.name}</div>
      <StaffNav setup={venue.status === "setup"} slug={slug} current="menu" admin={staff.role === "admin"} />
      <SoldOutBoard
        slug={slug}
        categories={categories.map((c) => ({ id: c.id, name: c.name, items: c.items.map((i) => ({ id: i.id, name: i.name, priceCents: i.priceCents, station: i.station, soldOut: i.soldOut })) }))}
      />
    </div>
  );
}
