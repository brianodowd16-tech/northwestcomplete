import { billingStatement, salesSummary, venueTables } from "@round/db/services";
import { eur } from "@/components/format";
import { StaffNav } from "@/components/StaffNav";
import { VenueTheme } from "@/components/VenueTheme";
import { requireStaffFor } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function Office({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { staff, venue } = await requireStaffFor(slug, { admin: true });
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 86_400_000);
  const s = await salesSummary(venue, start, end);
  const now = new Date();
  const bill = await billingStatement(venue, now.getUTCFullYear(), now.getUTCMonth() + 1);
  const tables = await venueTables(venue);
  const max = Math.max(1, ...s.byHour);
  const month = now.toLocaleString("en-IE", { month: "long", year: "numeric" });
  return (
    <div className="page stack">
      <VenueTheme color={venue.brandColor} />
      <div>
        <div className="label">{venue.name}</div>
        <StaffNav slug={slug} current="office" admin={staff.role === "admin"} />
        <h1 style={{ fontSize: 28 }}>Today</h1>
      </div>
      <div className="kpis">
        <div className="panel kpi"><b className="num">{eur(s.grossCents)}</b><span>App sales incl. VAT</span></div>
        <div className="panel kpi"><b className="num">{s.orders}</b><span>Orders ({s.tableOrders} table · {s.collectOrders} collect)</span></div>
        <div className="panel kpi"><b className="num">{eur(s.orders ? Math.round(s.grossCents / s.orders) : 0)}</b><span>Average order</span></div>
        <div className="panel kpi"><b className="num">{s.members}</b><span>Loyalty members</span></div>
      </div>
      <section className="panel stack">
        <div className="row"><h3>Sales by hour</h3><span className="muted small">App orders only; counter sales are in Revolut POS</span></div>
        <div className="bars" role="img" aria-label="Sales by hour">
          {s.byHour.map((v, h) => (
            <i key={h} className={h === now.getHours() ? "now" : ""} style={{ height: `${(v / max) * 100}%` }} title={`${h}:00 · ${eur(v)}`} />
          ))}
        </div>
        <div className="row small muted"><span>00:00</span><span>12:00</span><span>23:00</span></div>
      </section>
      <div className="two">
        <section className="panel stack">
          <h3>Today&apos;s money</h3>
          <table>
            <tbody>
              <tr><td>Card payments (Revolut)</td><td className="r num">{eur(s.cardCents)}</td></tr>
              <tr><td>Paid with loyalty credit</td><td className="r num">{eur(s.creditCents)}</td></tr>
              <tr><td>VAT at 9%</td><td className="r num">{eur(s.vat9Cents)}</td></tr>
              <tr><td>VAT at 23%</td><td className="r num">{eur(s.vat23Cents)}</td></tr>
              <tr><td>Refunded</td><td className="r num">{eur(s.refundedCents)}</td></tr>
            </tbody>
          </table>
        </section>
        <section className="panel stack">
          <h3>Round statement · {month}</h3>
          <table>
            <tbody>
              <tr><td>App payments</td><td className="r num">{eur(bill.appGrossCents)}</td></tr>
              <tr><td>Less refunds</td><td className="r num">−{eur(bill.appRefundsCents)}</td></tr>
              <tr><td>App fee ({bill.appFeeBps / 100}%)</td><td className="r num">{eur(bill.appFeeCents)}</td></tr>
              <tr><td>Monthly subscription</td><td className="r num">{eur(bill.subscriptionCents)}</td></tr>
              <tr><td>VAT 23% on fees</td><td className="r num">{eur(bill.vatCents)}</td></tr>
              <tr><td><b>Total due so far</b></td><td className="r num"><b>{eur(bill.totalCents)}</b></td></tr>
            </tbody>
          </table>
        </section>
      </div>
      <section className="panel stack">
        <h3>Table QR codes</h3>
        <p className="muted small" style={{ margin: 0 }}>Each link is what the printed QR code on that table opens.</p>
        <div className="tiles">
          {tables.map((t) => (
            <a key={t.id} className="tile" href={`/v/${slug}/t/${t.qrToken}`}>
              <b>Table {t.number}</b>
              <span className="muted small">Open ›</span>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
