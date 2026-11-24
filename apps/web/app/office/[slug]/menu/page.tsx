import { menuAdmin } from "@round/db/admin";
import { MenuEditor } from "@/components/MenuEditor";
import { StaffNav } from "@/components/StaffNav";
import { VenueTheme } from "@/components/VenueTheme";
import { requireStaffFor } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function MenuPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { staff, venue } = await requireStaffFor(slug, { admin: true });
  const cats = await menuAdmin(venue);
  return (
    <div className="page stack" style={{ maxWidth: 900 }}>
      <VenueTheme color={venue.brandColor} />
      <div>
        <div className="label">{venue.name}</div>
        <StaffNav setup={venue.status === "setup"} slug={slug} current="menuedit" admin={staff.role === "admin"} />
        <h1 style={{ fontSize: 28 }}>Menu</h1>
        <p className="muted small" style={{ margin: "4px 0 0" }}>Changes show on guests&apos; phones straight away. Prices include VAT. Tap an item to edit it.</p>
      </div>
      <MenuEditor slug={slug} cats={JSON.parse(JSON.stringify(cats))} />
    </div>
  );
}
