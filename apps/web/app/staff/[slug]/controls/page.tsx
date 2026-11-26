import { ControlsBoard } from "@/components/ControlsBoard";
import { StaffNav } from "@/components/StaffNav";
import { VenueTheme } from "@/components/VenueTheme";
import { requireStaffFor } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function Controls({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { staff, venue } = await requireStaffFor(slug);
  return (
    <div className="page stack" style={{ maxWidth: 1000 }}>
      <VenueTheme color={venue.brandColor} />
      <div>
        <div className="label">{venue.name}</div>
        <StaffNav setup={venue.status === "setup"} slug={slug} current="controls" admin={staff.role === "admin"} />
        <h1 style={{ fontSize: 26 }}>Lights, heating and music</h1>
      </div>
      <ControlsBoard />
    </div>
  );
}
