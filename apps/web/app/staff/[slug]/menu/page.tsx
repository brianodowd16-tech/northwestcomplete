import { menuForOffice } from "@round/db/services";
import { SoldOutBoard } from "@/components/SoldOutBoard";
import { StaffNav } from "@/components/StaffNav";
import { VenueTheme } from "@/components/VenueTheme";
import { requireStaffFor } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function MenuPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { staff, venue } = await requireStaffFor(slug);
  const items = await menuForOffice(venue);
  return (
    <div className="page">
      <VenueTheme color={venue.brandColor} />
      <div className="label">{venue.name}</div>
      <StaffNav slug={slug} current="menu" admin={staff.role === "admin"} />
      <p className="muted" style={{ marginTop: 0 }}>Tap to take an item off every guest&apos;s menu straight away.</p>
      <SoldOutBoard slug={slug} items={items.filter((i) => i.active)} />
    </div>
  );
}
