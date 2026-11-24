import { WASTE_REASONS, formatQty, type StockUnit } from "@round/core";
import { wasteReport } from "@round/db/inventory";
import { menu } from "@round/db/services";
import { ActionForm } from "@/components/ActionForm";
import { StaffNav } from "@/components/StaffNav";
import { VenueTheme } from "@/components/VenueTheme";
import { requireStaffFor } from "@/lib/server";

export const dynamic = "force-dynamic";

/** Quick waste logging for bar and kitchen staff: what, how many, why. */
export default async function WastePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { staff, venue } = await requireStaffFor(slug);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const [cats, today] = await Promise.all([menu(venue), wasteReport(venue, start, new Date(Date.now() + 60_000))]);
  return (
    <div className="page stack" style={{ maxWidth: 760 }}>
      <VenueTheme color={venue.brandColor} />
      <div>
        <div className="label">{venue.name}</div>
        <StaffNav setup={venue.status === "setup"} slug={slug} current="waste" admin={staff.role === "admin"} />
        <h1 style={{ fontSize: 26 }}>Log waste</h1>
      </div>
      <ActionForm endpoint="/api/staff/waste" action="waste" reset okText="Waste logged">
        <div className="two">
          <label className="field">What
            <select name="menuItemId" required>
              {cats.map((c) => (
                <optgroup key={c.id} label={c.name}>
                  {c.items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="field">How many<input name="servings" type="number" min={1} max={100} defaultValue={1} required /></label>
        </div>
        <div className="reasons" role="radiogroup" aria-label="Reason">
          {WASTE_REASONS.map((r, i) => (
            <label key={r} className="reason"><input type="radio" name="reason" value={r} defaultChecked={i === 0} /> <span>{r}</span></label>
          ))}
        </div>
        <button className="btn block">Log it</button>
      </ActionForm>
      <section className="panel stack">
        <h3>Logged today</h3>
        {today.recent.length === 0 ? <div className="empty">Nothing wasted today.</div> : (
          <table><tbody>{today.recent.map((r) => <tr key={r.id}><td className="small num">{new Date(r.at).toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit" })}</td><td>{r.name}<div className="muted small">{r.reason}</div></td><td className="r num">{formatQty(r.qty, r.unit as StockUnit)}</td></tr>)}</tbody></table>
        )}
      </section>
    </div>
  );
}
