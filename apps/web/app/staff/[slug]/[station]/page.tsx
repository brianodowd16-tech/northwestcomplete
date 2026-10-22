import { notFound } from "next/navigation";
import { DocketBoard } from "@/components/DocketBoard";
import { StaffNav } from "@/components/StaffNav";
import { VenueTheme } from "@/components/VenueTheme";
import { requireStaffFor } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function StationPage({ params }: { params: Promise<{ slug: string; station: string }> }) {
  const { slug, station } = await params;
  if (station !== "bar" && station !== "kitchen") notFound();
  const { staff, venue } = await requireStaffFor(slug);
  return (
    <div className="page">
      <VenueTheme color={venue.brandColor} />
      <div className="label">{venue.name}</div>
      <StaffNav slug={slug} current={station} admin={staff.role === "admin"} />
      <DocketBoard slug={slug} station={station} />
    </div>
  );
}
