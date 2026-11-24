import { forecast, fundingEstimate, payroll, priceSuggestions, staffNeeded } from "@round/core";
import { whatsOn } from "@round/db/events";
import { cardTakings90d, salesHistory, shifts } from "@round/db/growth";
import { profitReport } from "@round/db/inventory";
import { listTeam } from "@round/db/admin";
import { menu } from "@round/db/services";
import { ActionButton } from "@/components/ActionButton";
import { ActionForm } from "@/components/ActionForm";
import { eur } from "@/components/format";
import { StaffNav } from "@/components/StaffNav";
import { VenueTheme } from "@/components/VenueTheme";
import { requireStaffFor } from "@/lib/server";

export const dynamic = "force-dynamic";

/** The AI planner: next week's demand, the staff it needs, prices worth changing, payroll and funding. */
export default async function Planner({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { staff, venue } = await requireStaffFor(slug, { admin: true });
  const tz = venue.timezone;
  const now = new Date();
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const [history, events, profit, card90, team, weekShifts] = await Promise.all([
    salesHistory(venue, 8),
    whatsOn(venue, now, new Date(Date.now() + 7 * 86_400_000)),
    profitReport(venue, new Date(Date.now() - 30 * 86_400_000), now),
    cardTakings90d(venue),
    listTeam(venue),
    shifts(venue, weekAgo, now),
  ]);
  const lifts = events.map((e) => ({ start: e.start, end: e.end, lift: e.kind === "sport" ? 1.6 : 1.3 }));
  const f = forecast(history, { from: now, days: 7, weeks: 8, tz, events: lifts });
  const hourOf = (d: Date) => Number(d.toLocaleString("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }));
  const open = f.filter((h) => hourOf(h.at) >= 12 && hourOf(h.at) < 24);
  const days = [...new Set(open.map((h) => h.at.toLocaleDateString("en-CA", { timeZone: tz })))].map((d) => {
    const hs = open.filter((h) => h.at.toLocaleDateString("en-CA", { timeZone: tz }) === d);
    const staffHours = hs.reduce((s, h) => s + staffNeeded(h.orders), 0);
    const peak = hs.reduce((a, b) => (b.orders > a.orders ? b : a), hs[0]);
    return { d, cents: hs.reduce((s, h) => s + h.cents, 0), orders: Math.round(hs.reduce((s, h) => s + h.orders, 0)), staffHours, peak, hs, events: events.filter((e) => e.start.toLocaleDateString("en-CA", { timeZone: tz }) === d) };
  });
  const avgRate = team.length ? Math.round(weekShifts.reduce((s, x) => s + x.hourlyRateCents, 0) / Math.max(1, weekShifts.length)) || 1300 : 1300;
  const menuPrices = new Map((await menu(venue)).flatMap((c) => c.items).map((i) => [i.id, i.priceCents]));
  const ideasPriced = priceSuggestions(profit.items.filter((i) => menuPrices.has(i.id)).map((i) => ({ id: i.id, name: i.name, priceCents: menuPrices.get(i.id)!, gpPct: i.gpPct, class: i.class, hasRecipe: i.hasRecipe })));
  const pay = payroll(weekShifts, now);
  const fund = fundingEstimate(card90);
  const partner = process.env.FUNDING_PARTNER_URL;
  const maxCents = Math.max(1, ...days.map((d) => d.cents));
  return (
    <div className="page stack" style={{ maxWidth: 1100 }}>
      <VenueTheme color={venue.brandColor} />
      <div>
        <div className="label">{venue.name}</div>
        <StaffNav setup={venue.status === "setup"} slug={slug} current="planner" admin={staff.role === "admin"} />
        <h1 style={{ fontSize: 28 }}>Planner</h1>
        <p className="muted small" style={{ margin: "4px 0 0" }}>From the last 8 weeks of sales, lifted for the games and events in What&apos;s on. Nothing changes until you approve it.</p>
      </div>

      <section className="panel stack">
        <div className="row wrap"><h3>Next 7 days</h3><span className="muted small">Expected sales and the staff hours to cover them (12:00 to midnight)</span></div>
        {history.length === 0 && <div className="notice">Not enough sales history yet: the forecast fills in as orders come through.</div>}
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead><tr><th>Day</th><th>Expected sales</th><th className="r">Orders</th><th className="r">Staff hours</th><th className="r">Labour cost</th><th>Busiest</th><th>On</th></tr></thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.d}>
                  <td><b>{new Date(`${d.d}T12:00:00Z`).toLocaleDateString("en-IE", { weekday: "short", day: "numeric", month: "short" })}</b></td>
                  <td style={{ minWidth: 160 }}><div className="bar"><i style={{ width: `${(d.cents / maxCents) * 100}%` }} /></div><span className="num small">{eur(d.cents)}</span></td>
                  <td className="r num">{d.orders}</td>
                  <td className="r num">{d.staffHours}</td>
                  <td className="r num">{eur(d.staffHours * avgRate)}{d.cents ? <span className="muted small"> ({Math.round(((d.staffHours * avgRate) / d.cents) * 100)}%)</span> : null}</td>
                  <td className="small">{d.peak && d.peak.orders > 0 ? `${String(hourOf(d.peak.at)).padStart(2, "0")}:00 · ${staffNeeded(d.peak.orders)} on` : "—"}</td>
                  <td className="small">{d.events.slice(0, 2).map((e) => e.title).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <span className="muted small">Staff hours assume one person per 18 orders an hour, at least one on while open. Labour cost uses your team&apos;s hourly rates.</span>
      </section>

      <section className="panel stack">
        <h3>Price ideas (last 30 days)</h3>
        {ideasPriced.length === 0 ? <div className="empty">No changes suggested. Add recipes under Stock so the planner can see your margins.</div> : (
          <table><tbody>{ideasPriced.map((i) => (
            <tr key={i.id + i.kind}>
              <td><b>{i.name}</b><div className="muted small">{i.why}</div></td>
              <td className="r num">{i.kind === "raise" ? `${eur(i.fromCents)} → ${eur(i.toCents)}` : eur(i.fromCents)}</td>
              <td className="r">{i.kind === "raise" ? <ActionButton url={`/api/office/${slug}/planner`} body={{ action: "price", menuItemId: i.id, priceCents: i.toCents }} label="Apply" confirmText={`Change ${i.name} to ${eur(i.toCents)}?`} /> : <span className="chip plain">{i.kind === "promote" ? "Promote" : "Review"}</span>}</td>
            </tr>
          ))}</tbody></table>
        )}
      </section>

      <div className="two">
        <section className="panel stack">
          <div className="row"><h3>Payroll, last 7 days</h3><a className="btn sm ghost" href={`/api/office/${slug}/payroll.csv?from=${weekAgo.toISOString()}`}>Download CSV</a></div>
          {pay.length === 0 ? <div className="empty">No shifts yet. Staff clock in from the button at the top of their screens.</div> : (
            <table><tbody>{pay.map((p) => <tr key={p.email}><td>{p.name}</td><td className="r num">{p.hours.toFixed(2)} h</td><td className="r num">{eur(p.grossCents)}</td></tr>)}</tbody></table>
          )}
          <h3>Hourly rates</h3>
          {team.map((m) => (
            <ActionForm key={m.id} endpoint={`/api/office/${slug}/planner`} action="rate" className="row" okText="Saved">
              <input type="hidden" name="staffId" value={m.id} />
              <span style={{ flex: 1 }}>{m.name}</span>
              <input name="rate" inputMode="decimal" className="field-input" style={{ width: 90 }} placeholder="€/hour" defaultValue={""} />
              <button className="btn sm ghost">Save</button>
            </ActionForm>
          ))}
          <span className="muted small">The CSV imports into BrightPay, Sage or your accountant&apos;s payroll.</span>
        </section>
        <section className="panel stack">
          <h3>Funding</h3>
          <div className="row"><span>Card sales, last 90 days</span><b className="num">{eur(card90)}</b></div>
          {fund.eligible ? (
            <>
              <div className="kpi"><b className="num">up to {eur(fund.advanceCents)}</b><span>Indicative cash advance, repaid as {fund.holdbackPct}% of daily card takings (about {fund.estimatedDays} days at your current sales)</span></div>
              {partner ? <a className="btn" href={partner} target="_blank" rel="noopener">Get an offer</a> : <div className="notice">Offers come from a licensed lending partner. We&apos;re choosing one: this button switches on when we do.</div>}
            </>
          ) : (
            <div className="empty">Funding offers start at about €5,000 a month in card sales through Complete.</div>
          )}
          <span className="muted small">Complete doesn&apos;t lend. Any offer, its cost and the credit check come from the partner. Read their terms before accepting.</span>
        </section>
      </div>
    </div>
  );
}
