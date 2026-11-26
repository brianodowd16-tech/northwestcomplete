import { openAlerts, venueInvoices } from "@round/db/platform";
import { agentActivity } from "@round/db/ai";
import { reviewStats } from "@round/db/integrations";
import { billingStatement, dashboard, venueTables } from "@round/db/services";
import Link from "next/link";
import { eur } from "@/components/format";
import { LiveOffice } from "@/components/LiveOffice";
import { OfficeChart } from "@/components/OfficeChart";
import { StaffNav } from "@/components/StaffNav";
import { VenueTheme } from "@/components/VenueTheme";
import { requireStaffFor } from "@/lib/server";

export const dynamic = "force-dynamic";

const PERIODS = { today: { label: "Today", days: 1, vs: "yesterday" }, "7d": { label: "7 days", days: 7, vs: "previous 7 days" }, "30d": { label: "30 days", days: 30, vs: "previous 30 days" } } as const;
type Period = keyof typeof PERIODS;

function Delta({ now, before, vs }: { now: number; before: number; vs: string }) {
  if (!before && !now) return <span className="delta muted">No sales {vs}</span>;
  if (!before) return <span className="delta up">New vs {vs}</span>;
  const pct = Math.round(((now - before) / before) * 100);
  return (
    <span className={`delta ${pct >= 0 ? "up" : "down"}`}>
      {pct >= 0 ? "▲" : "▼"} {Math.abs(pct)}% vs {vs}
    </span>
  );
}

const DOCKET_TEXT = { new: "New", in_progress: "In progress", ready: "Ready", done: "Done" } as const;

export default async function Reports({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ p?: string }> }) {
  const { slug } = await params;
  const { staff, venue } = await requireStaffFor(slug, { admin: true });
  const p: Period = ((await searchParams).p as Period) in PERIODS ? ((await searchParams).p as Period) : "today";
  const P = PERIODS[p];
  const end = new Date();
  end.setHours(24, 0, 0, 0);
  const start = new Date(end.getTime() - P.days * 86_400_000);
  const [d, reviews, tables, agents] = await Promise.all([dashboard(venue, start, end), reviewStats(venue, start, end), venueTables(venue), agentActivity(venue, { limit: 8 })]);
  const now = new Date();
  const bill = await billingStatement(venue, now.getUTCFullYear(), now.getUTCMonth() + 1);
  const alerts = await openAlerts(venue);
  const invoices = await venueInvoices(venue);
  const avg = (s: { orders: number; grossCents: number }) => (s.orders ? Math.round(s.grossCents / s.orders) : 0);
  const chart =
    p === "today"
      ? d.now.byHour.map((cents, h) => ({ label: `${String(h).padStart(2, "0")}:00`, cents }))
      : d.byDay.map((x) => ({ label: new Date(x.day).toLocaleDateString("en-IE", { day: "numeric", month: "short" }), cents: x.grossCents }));
  const topMax = Math.max(1, ...d.topItems.map((i) => i.grossCents));
  const month = now.toLocaleString("en-IE", { month: "long", year: "numeric" });

  return (
    <div className="page stack">
      <VenueTheme color={venue.brandColor} />
      <LiveOffice slug={slug} />
      <div>
        <div className="label">{venue.name}</div>
        <StaffNav setup={venue.status === "setup"} slug={slug} current="reports" admin={staff.role === "admin"} />
        {alerts.map((a) => (
          <div key={a.id} className={a.severity === "error" ? "error" : "notice"} style={{ marginTop: 8 }}>
            <b>{a.title}</b> {a.detail} <a href={a.href}>Fix it</a>
          </div>
        ))}
        <div className="row wrap">
          <h1 style={{ fontSize: 28 }}>{P.label}</h1>
          <nav className="seg" aria-label="Period">
            {(Object.keys(PERIODS) as Period[]).map((k) => (
              <Link key={k} href={`/office/${slug}/reports?p=${k}`} aria-current={k === p ? "page" : undefined}>
                {PERIODS[k].label}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      <div className="kpis">
        <div className="panel kpi rise">
          <b className="num">{eur(d.now.grossCents)}</b>
          <span>Sales incl. VAT (app and till)</span>
          <Delta now={d.now.grossCents} before={d.before.grossCents} vs={P.vs} />
        </div>
        <div className="panel kpi rise">
          <b className="num">{d.now.orders}</b>
          <span>
            Orders ({d.now.tableOrders} table · {d.now.collectOrders} collect · {d.now.tillOrders} till)
          </span>
          <Delta now={d.now.orders} before={d.before.orders} vs={P.vs} />
        </div>
        <div className="panel kpi rise">
          <b className="num">{eur(avg(d.now))}</b>
          <span>Average order</span>
          <Delta now={avg(d.now)} before={avg(d.before)} vs={P.vs} />
        </div>
        <div className="panel kpi rise">
          <b className="num">{d.now.members}</b>
          <span>Loyalty members</span>
        </div>
        <div className="panel kpi rise">
          <b className="num">{venue.googlePlaceId ? reviews.clicks : "—"}</b>
          <span>{venue.googlePlaceId ? `Opened the Google review form (of ${reviews.orders} orders)` : "Add your Google Place ID in Settings to ask for reviews"}</span>
        </div>
      </div>

      

      <section className="panel stack">
        <div className="row wrap">
          <h3>{p === "today" ? "Sales by hour" : "Sales by day"}</h3>
          <span className="muted small">Hover or tap a bar. App and till sales.</span>
        </div>
        <OfficeChart points={chart} highlight={p === "today" ? now.getHours() : chart.length - 1} />
      </section>

      <div className="two">
        <section className="panel stack">
          <h3>Best sellers</h3>
          {d.topItems.length === 0 ? (
            <div className="empty">No sales in this period yet.</div>
          ) : (
            <div className="toplist">
              {d.topItems.map((i) => (
                <div key={i.name}>
                  <div className="sumrow small">
                    <span>
                      <b>{i.name}</b> <span className="muted">× {i.qty}</span>
                    </span>
                    <span className="num">{eur(i.grossCents)}</span>
                  </div>
                  <div className="bar">
                    <i style={{ width: `${(i.grossCents / topMax) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="panel stack">
          <div className="row">
            <h3>Latest orders</h3>
            <span className="live on">
              <i /> Live
            </span>
          </div>
          {d.recent.length === 0 ? (
            <div className="empty">Orders appear here the moment they&apos;re paid.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table>
                <tbody>
                  {d.recent.map((o, i) => (
                    <tr key={o.id} className={i === 0 && Date.now() - new Date(o.createdAt).getTime() < 60_000 ? "fresh" : ""}>
                      <td className="num">#{o.number}</td>
                      <td>{o.guest}</td>
                      <td className="small">{o.channel === "collect" ? "Collect" : o.channel === "counter" ? (o.tableNumber ? `Till · table ${o.tableNumber}` : "Till") : o.channel === "delivery" ? "Delivery" : o.tableNumber ? `Table ${o.tableNumber}` : "Table"}</td>
                      <td className="small">
                        {o.status === "refunded" ? (
                          <span className="chip crit">Refunded</span>
                        ) : o.status === "cancelled" ? (
                          <span className="chip plain">Not paid</span>
                        ) : (
                          o.dockets.map((x) => (
                            <span key={x.station} className={`chip ${x.status === "done" ? "ok" : x.status === "ready" ? "warn" : "plain"}`} style={{ marginRight: 4 }}>
                              {x.station === "bar" ? "Drinks" : "Food"}: {DOCKET_TEXT[x.status]}
                            </span>
                          ))
                        )}
                      </td>
                      <td className="r num">{eur(o.grossCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <div className="two">
        <section className="panel stack">
          <h3>Money · {P.label.toLowerCase()}</h3>
          <table>
            <tbody>
              <tr><td>Card payments</td><td className="r num">{eur(d.now.cardCents)}</td></tr>
              <tr><td>Paid with loyalty credit</td><td className="r num">{eur(d.now.creditCents)}</td></tr>
              <tr><td>VAT at 9%</td><td className="r num">{eur(d.now.vat9Cents)}</td></tr>
              <tr><td>VAT at 23%</td><td className="r num">{eur(d.now.vat23Cents)}</td></tr>
              <tr><td>Refunded</td><td className="r num">{eur(d.now.refundedCents)}</td></tr>
            </tbody>
          </table>
        </section>
        <section className="panel stack">
          <h3>Complete statement · {month}</h3>
          <table>
            <tbody>
              <tr><td>App payments</td><td className="r num">{eur(bill.appGrossCents)}</td></tr>
              <tr><td>Less refunds</td><td className="r num">−{eur(bill.appRefundsCents)}</td></tr>
              <tr><td>App fee ({bill.appFeeBps / 100}%)</td><td className="r num">{eur(bill.appFeeCents)}</td></tr>
              <tr><td>Monthly subscription</td><td className="r num">{eur(bill.subscriptionCents)}</td></tr>
              <tr><td>VAT 23% on fees</td><td className="r num">{eur(bill.vatCents)}</td></tr>
              <tr><td><b>Total due so far</b></td><td className="r num"><b>{eur(bill.totalCents)}</b></td></tr>
              {invoices.map((i) => <tr key={i.id}><td className="small">Invoice {i.number} ({i.period})</td><td className="r num small">{eur(i.totalCents)} · {i.status === "paid" ? "paid" : "issued"}</td></tr>)}
            </tbody>
          </table>
        </section>
      </div>

      <section className="panel stack">
        <div className="row wrap">
          <h3>Guests&apos; AI assistants</h3>
          <span className="muted small">Every request is checked against your rules and the limits each guest set.</span>
        </div>
        {agents.length === 0 ? (
          <div className="empty">No AI assistant activity yet. Guests connect one from Rewards → AI assistants.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table>
              <tbody>
                {agents.map((a) => (
                  <tr key={a.id}>
                    <td className="small num">{new Date(a.createdAt).toLocaleString("en-IE", { dateStyle: "short", timeStyle: "short" })}</td>
                    <td>{a.grantName}</td>
                    <td className="small">{a.tool.replace(/_/g, " ")}</td>
                    <td>{a.allowed ? <span className="chip ok">Allowed</span> : <span className="chip crit">Refused</span>}</td>
                    <td className="small muted">{a.allowed ? a.outcome : a.reasons[0]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <details className="panel">
        <summary style={{ cursor: "pointer" }}>
          <b>Table QR codes</b> <span className="muted small">({tables.length} tables)</span>
        </summary>
        <p className="muted small">Each link is what the printed QR code on that table opens.</p>
        <div className="tiles">
          {tables.map((t) => (
            <a key={t.id} className="tile" href={`/v/${slug}/t/${t.qrToken}`} target="_blank" rel="noopener">
              <b>Table {t.number}</b>
              <span className="muted small">Open ›</span>
            </a>
          ))}
        </div>
      </details>
    </div>
  );
}
