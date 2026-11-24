import { EVENT_KINDS, utcToZoned } from "@round/core";
import { listEvents } from "@round/db/events";
import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { eur } from "@/components/format";
import { StaffNav } from "@/components/StaffNav";
import { VenueTheme } from "@/components/VenueTheme";
import { requireStaffFor } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function EventsAdmin({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ edit?: string }> }) {
  const { slug } = await params;
  const { staff, venue } = await requireStaffFor(slug, { admin: true });
  const events = await listEvents(venue);
  const editId = (await searchParams).edit;
  const edit = events.find((e) => e.id === editId);
  const api = `/api/office/${slug}/events`;
  const tz = venue.timezone;
  const now = Date.now();
  const fmt = (d: Date) => d.toLocaleString("en-IE", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="page stack" style={{ maxWidth: 1000 }}>
      <VenueTheme color={venue.brandColor} />
      <div>
        <div className="label">{venue.name}</div>
        <StaffNav setup={venue.status === "setup"} slug={slug} current="events" admin={staff.role === "admin"} />
        <div className="row wrap">
          <h1 style={{ fontSize: 28 }}>What&apos;s on</h1>
          <a className="btn sm ghost" href={`/v/${slug}/events`} target="_blank" rel="noopener">See it as a guest</a>
        </div>
        <p className="muted small" style={{ margin: "4px 0 0" }}>Live music, sport on TV, quizzes and more. Guests see it in the What&apos;s on tab and can add it to their phone&apos;s calendar.</p>
      </div>
      <div className="two">
        <section className="panel stack">
          <h3>Listed</h3>
          {events.length === 0 ? <div className="empty">Nothing listed yet.</div> : (
            <table><tbody>{events.map((e) => {
              const past = !e.repeatWeekly && e.startsAt.getTime() + e.durationMins * 60_000 < now;
              return (
                <tr key={e.id} style={{ opacity: past ? 0.5 : 1 }}>
                  <td>{EVENT_KINDS[e.kind].icon}</td>
                  <td><b>{e.title}</b><div className="muted small">{e.repeatWeekly ? `Every ${e.startsAt.toLocaleDateString("en-IE", { timeZone: tz, weekday: "long" })} at ${e.startsAt.toLocaleTimeString("en-IE", { timeZone: tz, hour: "2-digit", minute: "2-digit" })}` : fmt(e.startsAt)}{e.coverCents ? ` · ${eur(e.coverCents)}` : ""}{past ? " · finished" : ""}</div></td>
                  <td className="r">
                    <div className="row" style={{ justifyContent: "flex-end" }}>
                      <Link className="btn sm ghost" href={`?edit=${e.id}`}>Edit</Link>
                      <ActionForm endpoint={api} action="delete" className="" confirmText={`Remove ${e.title}?`}><input type="hidden" name="id" value={e.id} /><button className="btn sm ghost">Remove</button></ActionForm>
                    </div>
                  </td>
                </tr>
              );
            })}</tbody></table>
          )}
        </section>
        <ActionForm key={edit?.id ?? "new"} endpoint={api} action="save" reset={!edit}>
          <h3>{edit ? `Edit ${edit.title}` : "Add an event"}</h3>
          {edit && <input type="hidden" name="id" value={edit.id} />}
          <div className="reasons" role="radiogroup" aria-label="Kind">
            {Object.entries(EVENT_KINDS).map(([k, v]) => (
              <label key={k} className="reason"><input type="radio" name="kind" value={k} defaultChecked={(edit?.kind ?? "music") === k} /> <span>{v.icon} {v.label}</span></label>
            ))}
          </div>
          <label className="field">Title<input name="title" required maxLength={100} defaultValue={edit?.title} placeholder="Ireland v France" /></label>
          <label className="field">Details (optional)<input name="details" maxLength={300} defaultValue={edit?.details} placeholder="Six Nations · Sound on" /></label>
          <div className="two">
            <label className="field">Starts<input name="starts" type="datetime-local" required defaultValue={edit ? utcToZoned(edit.startsAt, tz) : ""} /></label>
            <label className="field">Length (hours)<input name="hours" inputMode="decimal" defaultValue={edit ? String(edit.durationMins / 60) : "2"} /></label>
            <label className="field">Where in the venue<input name="where" maxLength={80} defaultValue={edit?.where} placeholder="Big screen" /></label>
            <label className="field">Entry price (€, blank if free)<input name="cover" inputMode="decimal" defaultValue={edit?.coverCents ? (edit.coverCents / 100).toFixed(2) : ""} /></label>
          </div>
          <label className="toggle small"><input type="checkbox" name="repeatWeekly" defaultChecked={edit?.repeatWeekly} /> Every week</label>
          <label className="field">Last week (optional)<input name="repeatUntil" type="date" defaultValue={edit?.repeatUntil ?? ""} /></label>
          <div className="row" style={{ justifyContent: "flex-start" }}>
            <button className="btn">{edit ? "Save" : "Add event"}</button>
            {edit && <Link className="btn ghost" href="?">Cancel</Link>}
          </div>
        </ActionForm>
      </div>
    </div>
  );
}
