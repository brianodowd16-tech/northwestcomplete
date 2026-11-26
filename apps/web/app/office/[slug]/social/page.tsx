import { IRISH_COUNTIES } from "@round/core";
import { socialChannels, socialRules, venuePosts } from "@round/db/social";
import { ActionButton } from "@/components/ActionButton";
import { ActionForm } from "@/components/ActionForm";
import { StaffNav } from "@/components/StaffNav";
import { VenueTheme } from "@/components/VenueTheme";
import { googleApp, metaApp, requireStaffFor } from "@/lib/server";

export const dynamic = "force-dynamic";

const NOTICE: Record<string, [string, string]> = {
  "meta=connected": ["notice", "Facebook is connected (with Instagram, if your Page has a business account linked)."],
  "meta=nopage": ["error", "No Facebook Page was shared. Connect again and tick this venue's Page."],
  "meta=failed": ["error", "Facebook didn't connect. Try again."],
  "meta=cancelled": ["error", "Facebook sign-in was cancelled."],
  "google=connected": ["notice", "Google Business Profile is connected."],
  "google=nolocation": ["error", "That Google account doesn't manage a Business Profile."],
  "google=failed": ["error", "Google didn't connect. Try again."],
  "google=cancelled": ["error", "Google sign-in was cancelled."],
};

/** Social media on autopilot: connected accounts, what gets posted, and the queue. */
export default async function Social({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string>> }) {
  const { slug } = await params;
  const { staff, venue } = await requireStaffFor(slug, { admin: true });
  const sp = await searchParams;
  const notice = Object.entries(sp).map(([k, v]) => NOTICE[`${k}=${v}`]).find(Boolean);
  const [{ channels, meta, google }, rules, posts] = await Promise.all([socialChannels(venue), socialRules(venue), venuePosts(venue)]);
  const api = `/api/office/${slug}/social`;
  const tz = venue.timezone;
  const fmt = (d: Date) => d.toLocaleString("en-IE", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const waiting = posts.filter((p) => p.status === "draft");
  return (
    <div className="page stack" style={{ maxWidth: 900 }}>
      <VenueTheme color={venue.brandColor} />
      <div>
        <div className="label">{venue.name}</div>
        <StaffNav setup={venue.status === "setup"} slug={slug} current="social" admin={staff.role === "admin"} />
        <h1 style={{ fontSize: 28 }}>Social</h1>
      </div>
      {notice && <div className={notice[0]}>{notice[1]}</div>}

      <section className="panel stack">
        <h3>Accounts</h3>
        <table><tbody>
          <tr>
            <td>Facebook Page{meta?.pageName ? <div className="muted small">{meta.pageName}</div> : null}</td>
            <td>{meta ? <span className="chip ok">Connected</span> : <span className="chip plain">Not connected</span>}</td>
            <td className="r">{metaApp() ? <a className="btn sm ghost" href={`/api/social/meta/connect?venue=${slug}`}>{meta ? "Reconnect" : "Connect Facebook and Instagram"}</a> : <span className="muted small">Not switched on for this server (META_APP_ID)</span>}</td>
          </tr>
          <tr>
            <td>Instagram{meta?.igUsername ? <div className="muted small">@{meta.igUsername}</div> : null}</td>
            <td>{meta?.igUserId ? <span className="chip ok">Connected</span> : <span className="chip plain">{meta ? "Link a business account to your Page" : "Comes with Facebook"}</span>}</td>
            <td />
          </tr>
          <tr>
            <td>Google Business Profile{google?.title ? <div className="muted small">{google.title}</div> : null}</td>
            <td>{google ? <span className="chip ok">Connected</span> : <span className="chip plain">Not connected</span>}</td>
            <td className="r">{googleApp() ? <a className="btn sm ghost" href={`/api/social/google/connect?venue=${slug}`}>{google ? "Reconnect" : "Connect Google"}</a> : <span className="muted small">Not switched on for this server (GOOGLE_CLIENT_ID)</span>}</td>
          </tr>
        </tbody></table>
        <span className="muted small">When Facebook asks, tick only this venue&apos;s Page. Instagram posting needs an Instagram business or creator account linked to that Page.</span>
        {meta && <ActionButton url={api} body={{ action: "disconnect", kind: "meta" }} label="Disconnect Facebook" ghost confirmText="Stop posting to Facebook and Instagram?" />}
      </section>

      <ActionForm endpoint={api} action="rules" className="panel stack" okText="Saved">
        <h3>What gets posted</h3>
        <label className="toggle"><input type="checkbox" name="events" defaultChecked={rules.events} /> Each event from What&apos;s on (and events you co-host), <input name="hours" type="number" min={1} max={72} defaultValue={rules.eventHoursBefore} className="field-input" style={{ width: 64 }} /> hours before</label>
        <label className="toggle"><input type="checkbox" name="games" defaultChecked={rules.games} /> Today&apos;s games on the screens, at 11:00</label>
        <label className="toggle"><input type="checkbox" name="weekly" defaultChecked={rules.weekly} /> The week ahead, Mondays at 10:00</label>
        <label className="toggle"><input type="checkbox" name="newFood" defaultChecked={rules.newFood} /> New food and soft drinks on the menu</label>
        <label className="toggle"><input type="checkbox" name="autoPublish" defaultChecked={rules.autoPublish} /> Post automatically (otherwise each post waits for your approval)</label>
        <span className="muted small">Posts never advertise alcohol prices or drinks offers. Anything that reads like one (happy hour, 2 for 1, cheap pints) always waits for you, even on automatic.</span>
        <div className="row wrap" style={{ justifyContent: "flex-start", gap: 6 }}><button className="btn sm">Save</button></div>
      </ActionForm>

      <section className="panel stack">
        <div className="row wrap">
          <h3>Posts {waiting.length ? <span className="chip warn">{waiting.length} to approve</span> : null}</h3>
          {channels.length > 0 && <ActionButton url={api} body={{ action: "plan" }} label="Plan posts now" ghost />}
        </div>
        {channels.length === 0 ? <div className="empty">Connect an account above and posts will be planned here from your What&apos;s on, games and menu.</div> : posts.length === 0 ? <div className="empty">Nothing planned yet.</div> : posts.map((p) => (
          <div key={p.id} className="card stack" style={{ gap: 6 }}>
            <div className="row wrap">
              <span className="small"><b>{fmt(p.scheduledFor)}</b> · {p.channels.join(", ")}{p.collaborators.length ? ` · with @${p.collaborators.join(", @")}` : ""}</span>
              <span className={`chip ${p.status === "posted" ? "ok" : p.status === "failed" ? "warn" : "plain"}`}>{{ draft: "Waiting for approval", approved: "Scheduled", posted: "Posted", failed: "Failed", skipped: "Skipped" }[p.status]}</span>
            </div>
            {p.status === "draft" || p.status === "approved" ? (
              <ActionForm endpoint={api} action="approve" className="stack" okText="Approved">
                <input type="hidden" name="id" value={p.id} />
                <textarea name="text" defaultValue={p.text} rows={5} className="field-input" style={{ textAlign: "left", width: "100%" }} />
                <div className="row wrap" style={{ justifyContent: "flex-start", gap: 6 }}>
                  <button className="btn sm">{p.status === "draft" ? "Approve" : "Save"}</button>
                  <a className="btn sm ghost" href={`/api/social/image/${p.id}.jpg`} target="_blank" rel="noreferrer">Picture</a>
                  <ActionButton url={api} body={{ action: "skip", id: p.id }} label="Skip" ghost />
                </div>
              </ActionForm>
            ) : (
              <div className="small" style={{ whiteSpace: "pre-wrap" }}>{p.text}{p.error ? <div className="error" style={{ marginTop: 6 }}>{p.error}</div> : null}</div>
            )}
          </div>
        ))}
      </section>

      {channels.length > 0 && (
        <ActionForm endpoint={api} action="manual" className="panel stack" okText="Done" reset>
          <h3>Write a post</h3>
          <label className="field">Headline on the picture<input name="title" maxLength={60} placeholder="Trad session tonight" /></label>
          <label className="field">Post<textarea name="text" rows={4} required className="field-input" style={{ textAlign: "left" }} /></label>
          <label className="field">When (blank = now)<input name="when" type="datetime-local" /></label>
          <button className="btn sm" style={{ alignSelf: "flex-start" }}>Post</button>
        </ActionForm>
      )}

      <ActionForm endpoint={api} action="community" className="panel stack" okText="Saved">
        <h3>Community</h3>
        <label className="field" style={{ maxWidth: 260 }}>County (for county leaderboards and round-ups)
          <select name="county" defaultValue={venue.county ?? ""}><option value="">Not set</option>{IRISH_COUNTIES.map((c) => <option key={c}>{c}</option>)}</select>
        </label>
        <label className="toggle"><input type="checkbox" name="shareNetwork" defaultChecked={venue.shareNetwork} /> Feature us in Complete&apos;s weekly &quot;Out in {venue.county ?? "your county"}&quot; posts with other venues</label>
        <label className="toggle"><input type="checkbox" name="songRequests" defaultChecked={venue.songRequests} /> Groups out here can send song requests (staff see them under Music)</label>
        <span className="muted small">Co-host an event with another venue on Complete (in What&apos;s on) and it&apos;s posted on both venues&apos; accounts, with Instagram collaboration when both are connected.</span>
        <button className="btn sm" style={{ alignSelf: "flex-start" }}>Save</button>
      </ActionForm>
    </div>
  );
}
