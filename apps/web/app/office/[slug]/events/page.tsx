import { EVENT_KINDS, utcToZoned } from "@round/core";
import { listEvents } from "@round/db/events";
import { liveVenues } from "@round/db/services";
import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { eur } from "@/components/format";
import { StaffNav } from "@/components/StaffNav";
import { VenueTheme } from "@/components/VenueTheme";
import QRCode from "qrcode";
import { appUrl, requireStaffFor } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function EventsAdmin({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ edit?: string }> }) {
  const { slug } = await params;
  const { staff, venue } = await requireStaffFor(slug, { admin: true });
  const events = await listEvents(venue);
  const others = (await liveVenues()).filter((v) => v.id !== venue.id);
  const editId = (await searchParams).edit;
  const edit = events.find((e) => e.id === editId);
  const api = `/api/office/${slug}/events`;
  const fplLink = `${appUrl()}/v/${slug}/fpl`;
  const fplQr = venue.fplCode ? await QRCode.toString(fplLink, { type: "svg", margin: 1 }) : null;
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
      <ActionForm endpoint={api} action="autoSports" className="panel row wrap">
        <label className="toggle"><input type="checkbox" name="on" defaultChecked={venue.autoSports} /> <span><b>List Ireland&apos;s top 3–5 games on TV every day</b><span className="muted small" style={{ display: "block" }}>Ireland and the provinces, GAA championship, Champions Cup and URC, the Premier League&apos;s big games, Champions League. Updated every morning. Add your own for anything else.</span></span></label>
        <button className="btn sm">Save</button>
      </ActionForm>
      <ActionForm endpoint={api} action="fpl" className="panel stack">
        <h3>⚽ Fantasy Premier League</h3>
        <p className="muted small" style={{ margin: 0 }}>
          Create a classic league on fantasy.premierleague.com (Leagues &amp; Cups → Create a league), then paste its invite code or link here. Guests see a &quot;Join our Fantasy Premier League&quot; button, and you get a link and QR code for posters and socials.
        </p>
        <div className="row wrap" style={{ justifyContent: "flex-start", alignItems: "flex-end" }}>
          <label className="field" style={{ width: 320 }}>Invite code or link<input name="code" defaultValue={venue.fplCode ?? ""} placeholder="https://fantasy.premierleague.com/leagues/auto-join/…" /></label>
          <button className="btn sm">Save</button>
        </div>
        {venue.fplCode && fplQr && (
          <div className="row wrap" style={{ justifyContent: "flex-start", gap: 16 }}>
            <div className="qr" style={{ width: 150, padding: 8 }} dangerouslySetInnerHTML={{ __html: fplQr }} />
            <div className="stack" style={{ gap: 6 }}>
              <span className="small">Your link to share:</span>
              <div className="token">{fplLink}</div>
              <span className="muted small">{venue.fplClicks} {venue.fplClicks === 1 ? "person has" : "people have"} opened it</span>
            </div>
          </div>
        )}
      </ActionForm>
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
            <label className="field">Co-hosted with (optional)<select name="partner" defaultValue={edit?.partnerVenueId ?? ""}><option value="">Just us</option>{others.map((v) => <option key={v.id} value={v.id}>{v.name}{v.town ? `, ${v.town}` : ""}</option>)}</select></label>
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
