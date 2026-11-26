import { controlHistory, devices, scenes } from "@round/db/controls";
import { integrationStatus } from "@round/db/integrations";
import { ActionButton } from "@/components/ActionButton";
import { ActionForm } from "@/components/ActionForm";
import { SceneBuilder } from "@/components/SceneBuilder";
import { SecretForm } from "@/components/SecretForm";
import { StaffNav } from "@/components/StaffNav";
import { VenueTheme } from "@/components/VenueTheme";
import { requireStaffFor } from "@/lib/server";

export const dynamic = "force-dynamic";
const KIND = { light: "Light", climate: "Heating / cooling", media: "Music", switch: "Switch", scene: "Scene" } as const;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Connect the venue's lighting, heating/cooling and music, choose what staff can use, and build scenes. */
export default async function VenueSystems({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { staff, venue } = await requireStaffFor(slug, { admin: true });
  const [st, devs, sc, log] = await Promise.all([integrationStatus(venue), devices(venue), scenes(venue), controlHistory(venue, 30)]);
  const api = `/api/office/${slug}/controls`;
  const ha = st.homeassistant, lifx = st.lifx, hook = st.controls_webhook;
  const live = devs.filter((d) => !d.missingSince);
  return (
    <div className="page stack" style={{ maxWidth: 1000 }}>
      <VenueTheme color={venue.brandColor} />
      <div>
        <div className="label">{venue.name}</div>
        <StaffNav setup={venue.status === "setup"} slug={slug} current="devices" admin={staff.role === "admin"} />
        <h1 style={{ fontSize: 28 }}>Venue systems</h1>
        <p className="muted" style={{ margin: 0 }}>Let staff run the lights, heating and air conditioning, and music from the Controls screen, within limits you set.</p>
      </div>

      <div className="two">
        <ActionForm endpoint={api} action="ha" className="panel stack" okText="Connected">
          <div className="row wrap"><h3>Home Assistant</h3>{ha?.hasSecret ? <span className="chip ok">Connected</span> : <span className="chip plain">Not connected</span>}</div>
          <p className="muted small" style={{ margin: 0 }}>The hub most installers use: Philips Hue, KNX and DALI lighting, Daikin, Mitsubishi, Nest and Tado heating, Sonos and other players, and Modbus/BACnet building systems all connect through it. Use its secure remote address and a long-lived access token (your Home Assistant profile → Security).</p>
          <label className="field">Address<input name="url" defaultValue={(ha?.config as { baseUrl?: string })?.baseUrl ?? ""} placeholder="https://yourvenue.ui.nabu.casa" required /></label>
          <label className="field">Access token<input name="token" type="password" autoComplete="off" required /></label>
          <button className="btn sm" style={{ alignSelf: "flex-start" }}>{ha?.hasSecret ? "Reconnect" : "Connect"}</button>
        </ActionForm>
        <div className="stack">
          <ActionForm endpoint={api} action="lifx" className="panel stack" okText="Connected">
            <div className="row wrap"><h3>LIFX lights</h3>{lifx?.hasSecret ? <span className="chip ok">Connected</span> : <span className="chip plain">Not connected</span>}</div>
            <label className="field">Personal access token (cloud.lifx.com)<input name="token" type="password" autoComplete="off" required /></label>
            <button className="btn sm" style={{ alignSelf: "flex-start" }}>{lifx?.hasSecret ? "Reconnect" : "Connect"}</button>
          </ActionForm>
          <section className="panel stack">
            <div className="row wrap"><h3>Building management system</h3>{hook?.hasSecret ? <span className="chip ok">Connected</span> : <span className="chip plain">Not connected</span>}</div>
            <p className="muted small" style={{ margin: 0 }}>For a BMS or integrator: each control is sent as signed JSON (<code>X-Complete-Signature: sha256=…</code>) with the device id, action and value. Add its devices below.</p>
            <SecretForm endpoint={api} action="webhook" button={hook?.hasSecret ? "Replace secret" : "Connect"}>
              <label className="field">Address (https)<input name="url" defaultValue={(hook?.config as { url?: string })?.url ?? ""} required /></label>
            </SecretForm>
          </section>
        </div>
      </div>

      <section className="panel stack">
        <div className="row wrap">
          <h3>Devices</h3>
          {(ha?.hasSecret || lifx?.hasSecret) && <ActionButton url={api} body={{ action: "discover" }} label="Find new devices" ghost />}
        </div>
        {live.length === 0 ? <div className="empty">Connect a system above and its devices appear here, hidden until you turn them on.</div> : (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead><tr><th>Device</th><th>Zone</th><th>Show</th><th>Staff</th><th>Limits</th><th /></tr></thead>
              <tbody>
                {live.map((d) => (
                  <tr key={d.id}>
                    <td colSpan={6} style={{ padding: 0 }}>
                      <ActionForm endpoint={api} action="device" className="row wrap" okText="Saved">
                        <input type="hidden" name="id" value={d.id} />
                        <span style={{ flex: "2 1 180px" }}><input name="name" className="field-input" style={{ width: "100%", textAlign: "left" }} defaultValue={d.name} /><span className="muted small">{KIND[d.kind]} · {d.provider === "homeassistant" ? "Home Assistant" : d.provider === "lifx" ? "LIFX" : "BMS"}</span></span>
                        <input name="zone" className="field-input" style={{ width: 120, textAlign: "left" }} defaultValue={d.zone} placeholder="Bar, Lounge…" />
                        <label className="toggle small"><input type="checkbox" name="enabled" defaultChecked={d.enabled} /> Show</label>
                        <label className="toggle small"><input type="checkbox" name="staffAllowed" defaultChecked={d.staffAllowed} /> Staff</label>
                        {d.kind === "climate" && <span className="small">°C <input name="minTemp" type="number" min={5} max={32} defaultValue={d.minTemp} className="field-input" style={{ width: 56 }} />–<input name="maxTemp" type="number" min={5} max={32} defaultValue={d.maxTemp} className="field-input" style={{ width: 56 }} /></span>}
                        {d.kind === "media" && <span className="small">Max volume <input name="maxVolume" type="number" min={1} max={100} defaultValue={d.maxVolume} className="field-input" style={{ width: 60 }} /></span>}
                        <button className="btn sm ghost">Save</button>
                      </ActionForm>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {hook?.hasSecret && (
          <ActionForm endpoint={api} action="addDevice" className="row wrap" okText="Added" reset>
            <input name="externalId" className="field-input" style={{ width: 140, textAlign: "left" }} placeholder="BMS device id" required />
            <select name="kind">{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            <input name="name" className="field-input" style={{ width: 160, textAlign: "left" }} placeholder="Name" required />
            <input name="zone" className="field-input" style={{ width: 110, textAlign: "left" }} placeholder="Zone" />
            <button className="btn sm ghost">Add BMS device</button>
          </ActionForm>
        )}
      </section>

      <section className="panel stack">
        <h3>Scenes</h3>
        {sc.length === 0 ? <div className="muted small">Save settings for many devices at once, such as &quot;Opening&quot;, &quot;Match on&quot; or &quot;Closing&quot;, and run them with one tap or on a schedule.</div> : (
          <table><tbody>{sc.map((s) => (
            <tr key={s.id}><td><b>{s.name}</b><div className="muted small">{s.steps.length} {s.steps.length === 1 ? "setting" : "settings"}{s.at ? ` · ${s.days.map((x) => DAYS[x]).join(" ")} at ${s.at}` : ""}{s.staffAllowed ? "" : " · managers only"}</div></td>
              <td className="r"><ActionButton url={api} body={{ action: "deleteScene", id: s.id }} label="Delete" ghost confirmText={`Delete ${s.name}?`} /></td></tr>
          ))}</tbody></table>
        )}
      </section>
      {live.length > 0 && <SceneBuilder endpoint={api} devices={live.map((d) => ({ id: d.id, name: d.name, kind: d.kind }))} />}

      <section className="panel stack">
        <h3>Recent changes</h3>
        {log.length === 0 ? <div className="empty">Nothing yet.</div> : (
          <table><tbody>{log.map((l) => (
            <tr key={l.id}>
              <td className="small">{l.createdAt.toLocaleString("en-IE", { timeZone: venue.timezone, weekday: "short", hour: "2-digit", minute: "2-digit" })}</td>
              <td className="small">{l.who}</td>
              <td className="small">{l.sceneId ? `Scene: ${l.value}` : `${devs.find((d) => d.id === l.deviceId)?.name ?? "Device"}: ${l.action}${l.value ? ` ${l.value}` : ""}`}</td>
              <td>{l.ok ? <span className="chip ok">OK</span> : <span className="chip warn" title={l.error ?? ""}>Failed</span>}</td>
            </tr>
          ))}</tbody></table>
        )}
      </section>
    </div>
  );
}
