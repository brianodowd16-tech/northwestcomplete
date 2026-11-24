import { PAYROLL_FORMATS, localDate, payrollPeriod, zonedToUtc } from "@round/core";
import { payrollData } from "@round/db/rota";
import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { eur } from "@/components/format";
import { StaffNav } from "@/components/StaffNav";
import { VenueTheme } from "@/components/VenueTheme";
import { requireStaffFor } from "@/lib/server";

export const dynamic = "force-dynamic";
const PERIODS = { week: ["This week", 7], last: ["Last week", 7], fortnight: ["Last 2 weeks", 14], month: ["This month", 31] } as const;

export default async function Payroll({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ p?: string }> }) {
  const { slug } = await params;
  const { staff, venue } = await requireStaffFor(slug, { admin: true });
  const tz = venue.timezone;
  const p = ((await searchParams).p ?? "last") as keyof typeof PERIODS;
  const today = localDate(new Date(), tz);
  const d = new Date(`${today}T12:00:00Z`);
  const monday = localDate(new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000), "UTC");
  const startDay =
    p === "week" ? monday : p === "last" ? localDate(new Date(new Date(`${monday}T12:00:00Z`).getTime() - 7 * 86_400_000), "UTC") : p === "fortnight" ? localDate(new Date(new Date(`${monday}T12:00:00Z`).getTime() - 14 * 86_400_000), "UTC") : `${today.slice(0, 8)}01`;
  const endDay = p === "last" || p === "fortnight" ? monday : localDate(new Date(d.getTime() + 86_400_000), "UTC");
  const from = zonedToUtc(`${startDay}T00:00`, tz), to = zonedToUtc(`${endDay}T00:00`, tz);
  const data = await payrollData(venue, from, to);
  const rows = payrollPeriod(data.shifts, { until: new Date(), tz, sundayPremiumPct: venue.sundayPremiumPct, tipsCents: data.tipsCents });
  const api = `/api/office/${slug}/rota`;
  const q = `from=${from.toISOString()}&to=${to.toISOString()}`;
  return (
    <div className="page stack" style={{ maxWidth: 1000 }}>
      <VenueTheme color={venue.brandColor} />
      <div>
        <div className="label">{venue.name}</div>
        <StaffNav setup={venue.status === "setup"} slug={slug} current="payroll" admin={staff.role === "admin"} />
        <div className="row wrap">
          <h1 style={{ fontSize: 26 }}>Payroll</h1>
          <nav className="seg">{Object.entries(PERIODS).map(([k, [l]]) => <Link key={k} href={`?p=${k}`} aria-current={p === k ? "page" : undefined}>{l}</Link>)}</nav>
        </div>
        <p className="muted small" style={{ margin: "4px 0 0" }}>
          {new Date(`${startDay}T12:00:00Z`).toLocaleDateString("en-IE", { day: "numeric", month: "short" })} to {new Date(new Date(`${endDay}T12:00:00Z`).getTime() - 86_400_000).toLocaleDateString("en-IE", { day: "numeric", month: "short" })} · from clock-ins
        </p>
      </div>
      <section className="panel stack">
        <div className="row wrap">
          <h3>Pay for the period</h3>
          <div className="row wrap">{(Object.entries(PAYROLL_FORMATS) as [string, string][]).map(([k, l]) => <a key={k} className="btn sm ghost" href={`/api/office/${slug}/payroll.csv?format=${k}&${q}`}>{l}</a>)}</div>
        </div>
        {rows.length === 0 ? <div className="empty">No clock-ins in this period.</div> : (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead><tr><th>Name</th><th>Payroll ref</th><th className="r">Hours</th><th className="r">Sunday hours</th><th className="r">Rate</th><th className="r">Gross pay</th><th className="r">Tips share</th></tr></thead>
              <tbody>
                {rows.map((r) => <tr key={r.staffId}><td>{r.name}</td><td className="small">{r.payrollRef || <span className="chip warn">missing</span>}</td><td className="r num">{r.hours.toFixed(2)}</td><td className="r num">{r.sundayHours.toFixed(2)}</td><td className="r num">{eur(r.rateCents)}</td><td className="r num">{eur(r.grossCents)}</td><td className="r num">{eur(r.tipsCents)}</td></tr>)}
                <tr><td><b>Total</b></td><td /><td className="r num"><b>{rows.reduce((s, r) => s + r.hours, 0).toFixed(2)}</b></td><td /><td /><td className="r num"><b>{eur(rows.reduce((s, r) => s + r.grossCents, 0))}</b></td><td className="r num"><b>{eur(data.tipsCents)}</b></td></tr>
              </tbody>
            </table>
          </div>
        )}
        <span className="muted small">Tips from app orders in the period are shared by hours worked; agree your tips policy with staff and display it, as the 2022 tips law requires. Import the file into BrightPay, Thesaurus Payroll Manager or Sage (map the columns on your first import), or use the spreadsheet.</span>
      </section>
      <div className="two">
        <section className="panel stack">
          <h3>Team pay details</h3>
          {data.team.map((m) => (
            <ActionForm key={m.id} endpoint={api} action="person" className="row wrap" okText="Saved">
              <input type="hidden" name="staffId" value={m.id} />
              <span style={{ flex: 1, minWidth: 120 }}>{m.name}</span>
              <input name="payrollRef" className="field-input" style={{ width: 100, textAlign: "left" }} placeholder="Payroll ref" defaultValue={m.payrollRef} />
              <input name="rate" className="field-input" style={{ width: 90 }} placeholder="€/hour" defaultValue={m.hourlyRateCents ? (m.hourlyRateCents / 100).toFixed(2) : ""} />
              <button className="btn sm ghost">Save</button>
            </ActionForm>
          ))}
        </section>
        <ActionForm endpoint={api} action="sunday" className="panel stack" okText="Saved">
          <h3>Sunday premium</h3>
          <p className="muted small" style={{ margin: 0 }}>Irish law requires a Sunday premium (extra pay, time off, or a rate that already allows for it). If your hourly rates already include it, leave this at 0.</p>
          <label className="field" style={{ maxWidth: 200 }}>Extra on Sunday hours (%)<input name="pct" type="number" min={0} max={100} defaultValue={venue.sundayPremiumPct} /></label>
          <button className="btn sm" style={{ alignSelf: "flex-start" }}>Save</button>
        </ActionForm>
      </div>
    </div>
  );
}
