import { menuAdmin } from "@round/db/admin";
import { ActionForm } from "@/components/ActionForm";
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
      <ActionForm endpoint={`/api/office/${slug}/menu`} action="import" className="panel stack" reset okText="Menu imported">
        <div className="row wrap"><h3>Import a menu</h3><span className="muted small">From a spreadsheet saved as CSV</span></div>
        <p className="muted small" style={{ margin: 0 }}>
          Columns: <code>section, name, price, vat, station, alcohol, allergens, description</code>. Station is bar or kitchen; VAT 9 or 23 (left blank: 9% for food, 23% for drinks); allergens like <code>gluten|milk</code>. Items with the same name are updated, not duplicated.
        </p>
        <input type="file" name="file" accept=".csv,text/csv,text/plain" required />
        <button className="btn sm" style={{ alignSelf: "flex-start" }}>Import</button>
      </ActionForm>
      <MenuEditor slug={slug} cats={JSON.parse(JSON.stringify(cats))} />
    </div>
  );
}
