import { localDate } from "@round/core";
import { myRota } from "@round/db/rota";
import { ActionButton } from "@/components/ActionButton";
import { ActionForm } from "@/components/ActionForm";
import { StaffNav } from "@/components/StaffNav";
import { VenueTheme } from "@/components/VenueTheme";
import { requireStaffFor } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function MyShifts({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { staff, venue } = await requireStaffFor(slug);
  const tz = venue.timezone;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const r = await myRota(staff, start, new Date(start.getTime() + 21 * 86_400_000));
  const t = (d: Date) => d.toLocaleTimeString("en-IE", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
  const hours = r.mine.reduce((s, x) => s + (x.endsAt.getTime() - x.startsAt.getTime()) / 3_600_000, 0);
  return (
    <div className="page stack" style={{ maxWidth: 760 }}>
      <VenueTheme color={venue.brandColor} />
      <div>
        <div className="label">{venue.name}</div>
        <StaffNav setup={venue.status === "setup"} slug={slug} current="shifts" admin={staff.role === "admin"} />
        <h1 style={{ fontSize: 26 }}>My shifts</h1>
        <p className="muted small" style={{ margin: "4px 0 0" }}>Shared till or tablet? Open <a href={`/clock/${slug}`}>{`/clock/${slug}`}</a> on it: everyone clocks in and out with their own passkey (Face ID, fingerprint or Windows Hello), so nobody can clock in for someone else. Add yours in <a href="/staff/security">Security</a>.</p>
      </div>
      <section className="panel stack">
        <div className="row"><h3>Next 3 weeks</h3><span className="chip plain num">{hours.toFixed(1)} hours</span></div>
        {r.mine.length === 0 ? <div className="empty">No published shifts yet.</div> : (
          <table><tbody>{r.mine.map((s) => (
            <tr key={s.id}><td><b>{s.startsAt.toLocaleDateString("en-IE", { timeZone: tz, weekday: "long", day: "numeric", month: "short" })}</b></td><td className="num">{t(s.startsAt)}–{t(s.endsAt)}</td><td className="small">{s.role}{s.note ? ` · ${s.note}` : ""}</td></tr>
          ))}</tbody></table>
        )}
      </section>
      <section className="panel stack">
        <h3>On today</h3>
        {r.today.length === 0 ? <div className="empty">Nobody rostered today.</div> : <table><tbody>{r.today.map((s) => <tr key={s.id}><td>{s.name}</td><td className="num">{t(s.startsAt)}–{t(s.endsAt)}</td><td className="small">{s.role}</td></tr>)}</tbody></table>}
      </section>
      <ActionForm endpoint="/api/staff/availability" action="unavailable" className="panel stack" reset okText="Saved">
        <h3>Can&apos;t work a day?</h3>
        <div className="row wrap" style={{ justifyContent: "flex-start", alignItems: "flex-end" }}>
          <label className="field" style={{ width: 180 }}>Day<input type="date" name="date" required min={localDate(new Date(), tz)} /></label>
          <label className="field" style={{ flex: 1, minWidth: 160 }}>Reason (optional)<input name="note" maxLength={120} /></label>
          <button className="btn sm">Tell my manager</button>
        </div>
        {r.off.length > 0 && (
          <table><tbody>{r.off.map((o) => <tr key={o.date}><td>{new Date(`${o.date}T12:00:00Z`).toLocaleDateString("en-IE", { weekday: "short", day: "numeric", month: "short" })}</td><td className="small muted">{o.note}</td><td className="r"><ActionButton url="/api/staff/availability" body={{ action: "available", date: o.date }} label="I can work" ghost /></td></tr>)}</tbody></table>
        )}
      </ActionForm>
    </div>
  );
}
