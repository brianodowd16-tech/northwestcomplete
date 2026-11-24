import { venueTables } from "@round/db/services";
import QRCode from "qrcode";
import { StaffNav } from "@/components/StaffNav";
import { NewCode, TableCount } from "@/components/TablesAdmin";
import { VenueTheme } from "@/components/VenueTheme";
import { appUrl, requireStaffFor } from "@/lib/server";

export const dynamic = "force-dynamic";

const svg = (url: string) => QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });

export default async function TablesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { staff, venue } = await requireStaffFor(slug, { admin: true });
  const tables = await venueTables(venue);
  const collectUrl = `${appUrl()}/v/${slug}/collect`;
  const codes = await Promise.all(tables.map(async (t) => ({ t, url: `${appUrl()}/v/${slug}/t/${t.qrToken}`, svg: await svg(`${appUrl()}/v/${slug}/t/${t.qrToken}`) })));
  return (
    <div className="page stack" style={{ maxWidth: 1000 }}>
      <VenueTheme color={venue.brandColor} />
      <div className="no-print">
        <div className="label">{venue.name}</div>
        <StaffNav setup={venue.status === "setup"} slug={slug} current="tables" admin={staff.role === "admin"} />
        <h1 style={{ fontSize: 28 }}>Tables and QR codes</h1>
        <p className="muted small" style={{ margin: "4px 0 0" }}>
          Print one code per table. Guests scan it to order to that table. The bar code is for people ordering drinks to collect.
        </p>
      </div>
      <TableCount slug={slug} count={tables.length} />
      <div className="qrgrid">
        <figure className="qr">
          <div dangerouslySetInnerHTML={{ __html: await svg(collectUrl) }} />
          <figcaption>
            <b>{venue.name}</b>
            <span>Scan to order drinks to collect at the bar</span>
          </figcaption>
        </figure>
        {codes.map(({ t, url, svg }) => (
          <figure key={t.id} className="qr">
            <div dangerouslySetInnerHTML={{ __html: svg }} />
            <figcaption>
              <b>Table {t.number}</b>
              <span>Scan to order and pay · {venue.name}</span>
              <span className="row no-print" style={{ justifyContent: "center", marginTop: 6 }}>
                <a className="btn sm ghost" href={url} target="_blank" rel="noopener">
                  Open
                </a>
                <NewCode slug={slug} tableId={t.id} number={t.number} />
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
