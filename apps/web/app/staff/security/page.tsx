import { redirect } from "next/navigation";
import { SecuritySettings } from "@/components/SecuritySettings";
import { StaffNav } from "@/components/StaffNav";
import { VenueTheme } from "@/components/VenueTheme";
import { currentStaff } from "@/lib/server";
import { venueById } from "@round/db/services";

export const dynamic = "force-dynamic";

export default async function Security() {
  const staff = await currentStaff();
  if (!staff) redirect("/staff/login?next=/staff/security");
  const venue = await venueById(staff.venueId);
  return (
    <div className="page stack" style={{ maxWidth: 760 }}>
      <VenueTheme color={venue.brandColor} />
      <div>
        <div className="label">{venue.name}</div>
        <StaffNav setup={venue.status === "setup"} slug={venue.slug} current="account" admin={staff.role === "admin"} />
        <h1 style={{ fontSize: 26 }}>Sign-in and security</h1>
        <p className="muted" style={{ margin: 0 }}>{staff.name} · {staff.email}</p>
      </div>
      <SecuritySettings as="staff" />
    </div>
  );
}
