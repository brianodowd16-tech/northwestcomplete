import { listTeam } from "@round/db/admin";
import { StaffNav } from "@/components/StaffNav";
import { TeamAdmin } from "@/components/TeamAdmin";
import { VenueTheme } from "@/components/VenueTheme";
import { requireStaffFor } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function TeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { staff, venue } = await requireStaffFor(slug, { admin: true });
  const team = await listTeam(venue);
  return (
    <div className="page stack" style={{ maxWidth: 820 }}>
      <VenueTheme color={venue.brandColor} />
      <div>
        <div className="label">{venue.name}</div>
        <StaffNav setup={venue.status === "setup"} slug={slug} current="team" admin={staff.role === "admin"} />
        <h1 style={{ fontSize: 28 }}>Team</h1>
      </div>
      <TeamAdmin slug={slug} team={team} me={staff.id} />
    </div>
  );
}
