import { sponsorLeads, sponsorReport, venueSponsorships } from "@round/db/sponsors";
import { ActionButton } from "@/components/ActionButton";
import { StaffNav } from "@/components/StaffNav";
import { VenueTheme } from "@/components/VenueTheme";
import { requireStaffFor } from "@/lib/server";

export const dynamic = "force-dynamic";

const NEXT: Record<string, [string, string][]> = { new: [["contacted", "Contacted"], ["closed", "Close"]], contacted: [["booked", "Booked"], ["closed", "Close"]], booked: [], closed: [] };

/** Enquiries from the venue's sponsorship (e.g. weddings), and how the placements are doing. */
export default async function Enquiries({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { staff, venue } = await requireStaffFor(slug, { admin: true });
  const sps = await venueSponsorships(venue);
  const leads = await sponsorLeads(venue);
  const reports = await Promise.all(sps.map(async (s) => ({ s, rows: await sponsorReport(s.id) })));
  const api = `/api/office/${slug}/enquiries`;
  return (
    <div className="page stack" style={{ maxWidth: 900 }}>
      <VenueTheme color={venue.brandColor} />
      <div>
        <div className="label">{venue.name}</div>
        <StaffNav setup={venue.status === "setup"} slug={slug} current="enquiries" admin={staff.role === "admin"} />
        <h1 style={{ fontSize: 28 }}>Enquiries</h1>
      </div>
      {sps.length === 0 && <div className="notice">Sponsor Complete (for example as the wedding partner) to appear on the landing page, in every guest&apos;s hub and as a Platinum perk. Enquiries land here and in your inbox. Talk to Complete to set it up.</div>}
      {reports.map(({ s, rows }) => (
        <section key={s.id} className="panel stack">
          <div className="row wrap"><h3>{s.title}</h3><span className={`chip ${s.active ? "ok" : "plain"}`}>{s.active ? `Live until ${s.endsAt.toLocaleDateString("en-IE")}` : "Paused"}</span></div>
          <table><thead><tr><th>Placement (30 days)</th><th className="r">Views</th><th className="r">Clicks</th><th className="r">Enquiries</th></tr></thead>
            <tbody>{rows.length ? rows.map((r) => <tr key={r.placement}><td>{r.placement}</td><td className="r num">{r.impressions}</td><td className="r num">{r.clicks}</td><td className="r num">{r.leads}</td></tr>) : <tr><td colSpan={4} className="muted">No views yet.</td></tr>}</tbody>
          </table>
        </section>
      ))}
      {(sps.length > 0 || leads.length > 0) && (
        <section className="panel">
          <h3>Enquiries</h3>
          {leads.length === 0 ? <span className="muted small">None yet.</span> : (
            <table><tbody>{leads.map((l) => (
              <tr key={l.id}>
                <td className="small">{l.createdAt.toLocaleDateString("en-IE", { day: "numeric", month: "short" })}</td>
                <td><b>{l.name}</b> <span className="chip plain">{l.status}</span><div className="muted small">{[l.email, l.phone, l.eventDate && `date ${l.eventDate}`, l.guests && `${l.guests} guests`].filter(Boolean).join(" · ")}</div>{l.message && <div className="small">{l.message}</div>}</td>
                <td className="r"><span className="row" style={{ gap: 6, justifyContent: "flex-end" }}>{NEXT[l.status].map(([to, label]) => <ActionButton key={to} url={api} body={{ id: l.id, status: to }} label={label} ghost={to === "closed"} />)}</span></td>
              </tr>
            ))}</tbody></table>
          )}
        </section>
      )}
    </div>
  );
}
