import { forecast, localDate, rotaChecks, staffNeeded } from "@round/core";
import { whatsOn } from "@round/db/events";
import { salesHistory } from "@round/db/growth";
import { weekRota, weekStart } from "@round/db/rota";
import Link from "next/link";
import { ActionButton } from "@/components/ActionButton";
import { ActionForm } from "@/components/ActionForm";
import { eur } from "@/components/format";
import { StaffNav } from "@/components/StaffNav";
import { VenueTheme } from "@/components/VenueTheme";
import { requireStaffFor } from "@/lib/server";

export const dynamic = "force-dynamic";
const ROLES = ["bar", "floor", "kitchen", "manager", "other"];

export default async function Rota({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ w?: string }> }) {
  const { slug } = await params;
  const { staff, venue } = await requireStaffFor(slug, { admin: true });
  const tz = venue.timezone;
  const q = (await searchParams).w;
  const monday = weekStart(q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : localDate(new Date(), tz), tz);
  const prev = weekStart(localDate(new Date(new Date(`${monday}T12:00:00Z`).getTime() - 7 * 86_400_000), "UTC"), tz);
  const next = weekStart(localDate(new Date(new Date(`${monday}T12:00:00Z`).getTime() + 7 * 86_400_000), "UTC"), tz);
  const [w, history] = await Promise.all([weekRota(venue, monday), salesHistory(venue, 8)]);
  const weekFrom = new Date(`${monday}T00:00:00Z`);
  const events = await whatsOn(venue, weekFrom, new Date(weekFrom.getTime() + 7 * 86_400_000));
  const f = forecast(history, { from: weekFrom, days: 7, weeks: 8, tz, events: events.map((e) => ({ start: e.start, end: e.end, lift: e.kind === "sport" ? 1.6 : 1.3 })) });
  const checks = rotaChecks(w.shifts, w.unavailable, tz);
  const hrs = (s: { startsAt: Date; endsAt: Date }) => (s.endsAt.getTime() - s.startsAt.getTime()) / 3_600_000;
  const rate = new Map(w.team.map((m) => [m.id, m.hourlyRateCents]));
  const t = (d: Date) => d.toLocaleTimeString("en-IE", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
  const dayOf = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: tz });
  const perDay = w.days.map((d) => {
    const hs = f.filter((h) => dayOf(h.at) === d && Number(h.at.toLocaleString("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" })) >= 12);
    const rostered = w.shifts.filter((s) => dayOf(s.startsAt) === d);
    return { d, needed: hs.reduce((s, h) => s + staffNeeded(h.orders), 0), rostered: rostered.reduce((s, x) => s + hrs(x), 0), cost: rostered.reduce((s, x) => s + hrs(x) * (rate.get(x.staffId) ?? 0), 0), sales: hs.reduce((s, h) => s + h.cents, 0) };
  });
  const unpublished = w.shifts.filter((s) => !s.published).length;
  // planned vs actual (past shifts)
  const actual = w.shifts
    .filter((s) => s.startsAt < new Date())
    .map((s) => {
      const c = w.worked.find((x) => x.staffId === s.staffId && Math.abs(x.clockIn.getTime() - s.startsAt.getTime()) < 4 * 3_600_000);
      const late = c ? Math.round((c.clockIn.getTime() - s.startsAt.getTime()) / 60_000) : null;
      return { s, c, late };
    });
  return (
    <div className="page stack" style={{ maxWidth: 1200 }}>
      <VenueTheme color={venue.brandColor} />
      <div>
        <div className="label">{venue.name}</div>
        <StaffNav setup={venue.status === "setup"} slug={slug} current="rota" admin={staff.role === "admin"} />
        <div className="row wrap">
          <h1 style={{ fontSize: 26 }}>Rota · week of {new Date(`${monday}T12:00:00Z`).toLocaleDateString("en-IE", { day: "numeric", month: "long" })}</h1>
          <div className="row">
            <nav className="seg"><Link href={`?w=${prev}`}>‹ Previous</Link><Link href={`?w=${next}`}>Next ›</Link></nav>
            <ActionButton url={`/api/office/${slug}/rota`} body={{ action: "copy", from: prev, to: monday }} label="Copy last week" ghost />
            <ActionButton url={`/api/office/${slug}/rota`} body={{ action: "publish", week: monday }} label={unpublished ? `Publish (${unpublished} new)` : "Published"} confirmText="Publish this week? Everyone on it can see their shifts, and they're emailed." />
          </div>
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table className="rota">
          <thead>
            <tr>
              <th>Team</th>
              {w.days.map((d) => <th key={d}>{new Date(`${d}T12:00:00Z`).toLocaleDateString("en-IE", { weekday: "short", day: "numeric" })}</th>)}
              <th className="r">Hours</th>
            </tr>
          </thead>
          <tbody>
            {w.team.map((m) => {
              const mine = w.shifts.filter((s) => s.staffId === m.id);
              return (
                <tr key={m.id}>
                  <td><b>{m.name}</b>{!m.hourlyRateCents && <div className="muted small">no rate set</div>}</td>
                  {w.days.map((d) => (
                    <td key={d} className={w.unavailable.some((u) => u.staffId === m.id && u.date === d) ? "off" : ""}>
                      {mine.filter((s) => dayOf(s.startsAt) === d).map((s) => (
                        <div key={s.id} className={`shiftchip ${s.role}${s.published ? "" : " draft"}`}>
                          {t(s.startsAt)}–{t(s.endsAt)} <span className="muted">{s.role}</span>
                          <ActionButton url={`/api/office/${slug}/rota`} body={{ action: "delete", id: s.id }} label="×" ghost />
                        </div>
                      ))}
                      {w.unavailable.some((u) => u.staffId === m.id && u.date === d) && <div className="muted small">Can&apos;t work</div>}
                    </td>
                  ))}
                  <td className="r num">{mine.reduce((s, x) => s + hrs(x), 0).toFixed(1)}</td>
                </tr>
              );
            })}
            <tr className="muted small">
              <td>Needed / rostered</td>
              {perDay.map((p) => <td key={p.d} className={p.rostered + 0.01 < p.needed ? "under" : ""}>{p.needed}h / {p.rostered.toFixed(1)}h</td>)}
              <td />
            </tr>
            <tr className="muted small">
              <td>Labour / expected sales</td>
              {perDay.map((p) => <td key={p.d}>{eur(Math.round(p.cost))}{p.sales ? ` / ${eur(p.sales)}` : ""}</td>)}
              <td className="r num">{eur(Math.round(perDay.reduce((s, p) => s + p.cost, 0)))}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="two">
        <ActionForm endpoint={`/api/office/${slug}/rota`} action="save" okText="Shift added">
          <h3>Add a shift</h3>
          <div className="two">
            <label className="field">Who<select name="staffId" required>{w.team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
            <label className="field">Day<select name="date">{w.days.map((d) => <option key={d} value={d}>{new Date(`${d}T12:00:00Z`).toLocaleDateString("en-IE", { weekday: "long", day: "numeric" })}</option>)}</select></label>
            <label className="field">Start<input type="time" name="start" defaultValue="17:00" required /></label>
            <label className="field">Finish (past midnight is fine)<input type="time" name="end" defaultValue="23:30" required /></label>
            <label className="field">Role<select name="role">{ROLES.map((r) => <option key={r}>{r}</option>)}</select></label>
            <label className="field">Note<input name="note" maxLength={120} placeholder="Opening, match day…" /></label>
          </div>
          <button className="btn">Add shift</button>
          <span className="muted small">New and changed shifts are drafts until you press Publish.</span>
        </ActionForm>
        <section className="panel stack">
          <h3>Checks</h3>
          {checks.length === 0 ? <div className="notice">No problems: rest, hours and availability are fine.</div> : (
            <table><tbody>{checks.map((c, i) => <tr key={i}><td><span className={`chip ${c.level === "warn" ? "crit" : "plain"}`}>{c.level === "warn" ? "Fix" : "Note"}</span></td><td><b>{c.name}</b> · {c.text}</td></tr>)}</tbody></table>
          )}
          <span className="muted small">Based on the Organisation of Working Time Act: 11 hours&apos; rest between shifts, breaks after 4.5 and 6 hours, at most 48 hours a week on average. Under-18s have stricter limits.</span>
        </section>
      </div>

      {actual.length > 0 && (
        <section className="panel stack">
          <h3>Planned vs clocked in</h3>
          <table><tbody>{actual.map(({ s, c, late }) => (
            <tr key={s.id}>
              <td>{s.name}</td><td className="small">{s.startsAt.toLocaleDateString("en-IE", { timeZone: tz, weekday: "short" })} {t(s.startsAt)}–{t(s.endsAt)}</td>
              <td>{!c ? <span className="chip crit">Didn&apos;t clock in</span> : late! > 10 ? <span className="chip warn">{late} min late</span> : <span className="chip ok">On time</span>}</td>
              <td className="small muted">{c ? `in ${t(c.clockIn)}${c.clockOut ? `, out ${t(c.clockOut)}` : ""}` : ""}</td>
            </tr>
          ))}</tbody></table>
        </section>
      )}
    </div>
  );
}
