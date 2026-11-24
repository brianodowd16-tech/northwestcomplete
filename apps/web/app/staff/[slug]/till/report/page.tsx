import { localDate } from "@round/core";
import { cashUps, dayReport, openTabs } from "@round/db/till";
import { ActionForm } from "@/components/ActionForm";
import Link from "next/link";
import { eur } from "@/components/format";
import { StaffNav } from "@/components/StaffNav";
import { VenueTheme } from "@/components/VenueTheme";
import { requireStaffFor } from "@/lib/server";

export const dynamic = "force-dynamic";

/** End-of-day (Z) report: what the drawer and the card terminal should hold. */
export default async function TillReport({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ d?: string }> }) {
  const { slug } = await params;
  const { staff, venue } = await requireStaffFor(slug);
  const q = (await searchParams).d;
  const date = q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : localDate(new Date(), venue.timezone);
  const [r, ups, tabs] = await Promise.all([dayReport(venue, date), cashUps(venue, date), openTabs(venue)]);
  const lastUp = ups[0];
  const prev = localDate(new Date(new Date(`${date}T12:00:00Z`).getTime() - 86_400_000), "UTC");
  const next = localDate(new Date(new Date(`${date}T12:00:00Z`).getTime() + 86_400_000), "UTC");
  return (
    <div className="page stack" style={{ maxWidth: 860 }}>
      <VenueTheme color={venue.brandColor} />
      <div>
        <div className="label">{venue.name}</div>
        <StaffNav setup={venue.status === "setup"} slug={slug} current="till" admin={staff.role === "admin"} />
        <div className="row wrap">
          <h1 style={{ fontSize: 26 }}>End of day · {new Date(`${date}T12:00:00Z`).toLocaleDateString("en-IE", { weekday: "long", day: "numeric", month: "long" })}</h1>
          <nav className="seg">
            <Link href={`?d=${prev}`}>‹ Day before</Link>
            <Link href={`?d=${next}`}>Day after ›</Link>
          </nav>
        </div>
      </div>
      <div className="kpis">
        <div className="panel kpi"><b className="num">{eur(r.till.cashCents)}</b><span>Cash: should be in the drawer (plus your float)</span></div>
        <div className="panel kpi"><b className="num">{eur(r.till.cardCents)}</b><span>Card on the myPOS terminal</span></div>
        {r.till.roomCents > 0 && <div className="panel kpi"><b className="num">{eur(r.till.roomCents)}</b><span>Charged to rooms</span></div>}
        <div className="panel kpi"><b className="num">{eur(r.till.grossCents)}</b><span>Till sales ({r.till.sales})</span></div>
        <div className="panel kpi"><b className="num">{eur(r.app.paidCents)}</b><span>App orders paid by card ({r.app.orders})</span></div>
        <div className="panel kpi"><b className="num">{eur(r.app.tipsCents)}</b><span>Tips to share with staff (in the app card total)</span></div>
      </div>
      {tabs.length > 0 && <div className="notice">{tabs.length} tab{tabs.length > 1 ? "s are" : " is"} still open: close them on the Till before cashing up.</div>}
      <ActionForm endpoint="/api/staff/cashup" action="cashup" className="panel stack" okText="Cash-up saved">
        <h3>Cash-up</h3>
        <input type="hidden" name="date" value={date} />
        <div className="row wrap" style={{ justifyContent: "flex-start", alignItems: "flex-end" }}>
          <label className="field" style={{ width: 160 }}>Float at start (€)<input name="float" inputMode="decimal" defaultValue="150.00" /></label>
          <label className="field" style={{ width: 160 }}>Counted in drawer (€)<input name="counted" inputMode="decimal" required /></label>
          <label className="field" style={{ flex: 1, minWidth: 180 }}>Note (optional)<input name="note" maxLength={200} /></label>
          <button className="btn">Save cash-up</button>
        </div>
        {lastUp && (
          <div className={lastUp.varianceCents === 0 ? "notice" : "error"}>
            Last cash-up: expected {eur(lastUp.expectedCents)}, counted {eur(lastUp.countedCents)} ·{" "}
            {lastUp.varianceCents === 0 ? "spot on" : `${lastUp.varianceCents > 0 ? "over" : "short"} by ${eur(Math.abs(lastUp.varianceCents))}`}
          </div>
        )}
      </ActionForm>
      <div className="two">
        <section className="panel stack">
          <h3>Till</h3>
          <table><tbody>
            <tr><td>VAT at 9%</td><td className="r num">{eur(r.till.vat9Cents)}</td></tr>
            <tr><td>VAT at 23%</td><td className="r num">{eur(r.till.vat23Cents)}</td></tr>
            <tr><td>Refunds ({r.till.refunds})</td><td className="r num">−{eur(r.till.refundedCents)}</td></tr>
            <tr><td>Discounts and comps given</td><td className="r num">{eur(r.till.discountCents)}</td></tr>
            {tabs.length > 0 && <tr><td>Open tabs not yet paid ({tabs.length})</td><td className="r num">{eur(tabs.reduce((s, t) => s + t.totalCents, 0))}</td></tr>}
            <tr><td><b>Total incl. app orders</b></td><td className="r num"><b>{eur(r.till.grossCents + r.app.grossCents)}</b></td></tr>
          </tbody></table>
          <span className="muted small">Card money goes straight to your myPOS account. Check the terminal&apos;s own end-of-day total matches.</span>
        </section>
        <section className="panel stack">
          <h3>By staff</h3>
          {r.byStaff.length === 0 ? <div className="empty">No till sales.</div> : <table><tbody>{r.byStaff.map((s) => <tr key={s.name}><td>{s.name}</td><td className="r num">{s.sales}</td><td className="r num">{eur(s.cents)}</td></tr>)}</tbody></table>}
          <h3>Best sellers</h3>
          {r.topItems.length === 0 ? <div className="empty">—</div> : <table><tbody>{r.topItems.map((i) => <tr key={i.name}><td>{i.name}</td><td className="r num">{i.qty}</td><td className="r num">{eur(i.cents)}</td></tr>)}</tbody></table>}
        </section>
      </div>
    </div>
  );
}
