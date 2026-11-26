"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "./Toasts";

type State = { available: boolean; on?: boolean; brightness?: number; current?: number; target?: number; mode?: string; modes?: string[]; playing?: boolean; volume?: number; title?: string };
type Dev = { id: string; kind: "light" | "climate" | "media" | "switch" | "scene"; name: string; zone: string; minTemp: number; maxTemp: number; maxVolume: number; state: State };
type Data = { devices: Dev[]; scenes: { id: string; name: string; schedule: { days: number[]; at: string } | null }[]; errors: string[] };
const MODE: Record<string, string> = { heat: "Heat", cool: "Cool", heat_cool: "Heat/cool", auto: "Auto", fan_only: "Fan", off: "Off", dry: "Dry" };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Lights, heating, music and scenes for staff, refreshed every 15 seconds. */
export function ControlsBoard() {
  const [d, setD] = useState<Data | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await fetch("/api/staff/controls");
    if (r.ok) setD(await r.json());
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(() => !document.hidden && load(), 15_000);
    return () => clearInterval(t);
  }, [load]);
  const act = async (body: Record<string, unknown>, key: string) => {
    setBusy(key);
    const r = await fetch("/api/staff/controls", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    setBusy(null);
    if (!r.ok) return toast(j.error, { kind: "err" });
    if (j.message) toast(j.message, { kind: "ok" });
    setTimeout(load, 600);
  };
  if (!d) return <div className="empty">Loading…</div>;
  const zones = [...new Set(d.devices.map((x) => x.zone || "Venue"))];
  return (
    <div className="stack">
      {d.errors.map((e) => <div key={e} className="error">{e}</div>)}
      {d.scenes.length > 0 && (
        <section className="panel stack" style={{ gap: 8 }}>
          <h3>Scenes</h3>
          <div className="row wrap" style={{ justifyContent: "flex-start", gap: 8 }}>
            {d.scenes.map((s) => (
              <button key={s.id} className="btn" disabled={busy === s.id} onClick={() => act({ sceneId: s.id }, s.id)}>
                {s.name}{s.schedule ? <span className="small" style={{ display: "block", fontWeight: 400, opacity: 0.8 }}>{s.schedule.days.map((x) => DAYS[x]).join(" ")} {s.schedule.at}</span> : null}
              </button>
            ))}
          </div>
        </section>
      )}
      {d.devices.length === 0 && <div className="empty">No controls yet. A manager connects the venue&apos;s lights, heating and music in Back office → Venue systems.</div>}
      {zones.map((z) => (
        <section key={z} className="panel stack" style={{ gap: 10 }}>
          <h3>{z}</h3>
          <div className="tiles">
            {d.devices.filter((x) => (x.zone || "Venue") === z).map((x) => {
              const s = x.state, off = !s.available;
              const send = (action: string, value?: unknown) => act({ deviceId: x.id, action, value }, x.id);
              return (
                <div key={x.id} className="tile" style={{ display: "block", opacity: off ? 0.55 : 1 }}>
                  <div className="row"><b>{{ light: "💡", climate: "🌡️", media: "🎵", switch: "🔌", scene: "✨" }[x.kind]} {x.name}</b>{off && <span className="chip warn">offline</span>}</div>
                  {!off && (x.kind === "light" || x.kind === "switch") && (
                    <div className="stack" style={{ gap: 6, marginTop: 8 }}>
                      <div className="row" style={{ gap: 6, justifyContent: "flex-start" }}>
                        <button className={`btn sm ${s.on ? "" : "ghost"}`} disabled={busy === x.id} onClick={() => send("on")}>On</button>
                        <button className={`btn sm ${s.on ? "ghost" : ""}`} disabled={busy === x.id} onClick={() => send("off")}>Off</button>
                      </div>
                      {x.kind === "light" && <label className="small muted">Brightness {s.brightness ?? "–"}%<input type="range" min={1} max={100} defaultValue={s.brightness ?? 60} key={`${x.id}:${s.brightness}`} onPointerUp={(e) => send("brightness", (e.target as HTMLInputElement).value)} onKeyUp={(e) => e.key.startsWith("Arrow") && send("brightness", (e.target as HTMLInputElement).value)} style={{ width: "100%" }} /></label>}
                    </div>
                  )}
                  {!off && x.kind === "climate" && (
                    <div className="stack" style={{ gap: 6, marginTop: 8 }}>
                      <div className="muted small">Now {s.current ?? "–"}°C · {MODE[s.mode ?? ""] ?? s.mode}</div>
                      {s.target !== undefined ? (
                        <div className="row" style={{ gap: 6, justifyContent: "flex-start" }}>
                          <button className="btn sm ghost" aria-label="Cooler" disabled={busy === x.id || s.target <= x.minTemp} onClick={() => send("setpoint", Math.max(x.minTemp, s.target! - 0.5))}>−</button>
                          <b className="num" style={{ fontSize: 22, minWidth: 64, textAlign: "center" }}>{s.target}°</b>
                          <button className="btn sm ghost" aria-label="Warmer" disabled={busy === x.id || s.target >= x.maxTemp} onClick={() => send("setpoint", Math.min(x.maxTemp, s.target! + 0.5))}>+</button>
                        </div>
                      ) : (
                        // The system doesn't report its setting (e.g. a building system): pick one within the limits.
                        <select aria-label="Set temperature" defaultValue="" disabled={busy === x.id} onChange={(e) => e.target.value && send("setpoint", Number(e.target.value))}>
                          <option value="">Set to…</option>
                          {Array.from({ length: (x.maxTemp - x.minTemp) * 2 + 1 }, (_, i) => x.minTemp + i / 2).map((t) => <option key={t} value={t}>{t}°C</option>)}
                        </select>
                      )}
                      <select value={s.mode ?? ""} onChange={(e) => e.target.value && send("mode", e.target.value)} disabled={busy === x.id}>
                        {!s.mode && <option value="">Mode…</option>}
                        {(s.modes?.length ? s.modes : ["heat", "cool", "auto", "off"]).map((m) => <option key={m} value={m}>{MODE[m] ?? m}</option>)}
                      </select>
                      <span className="muted small">Limits {x.minTemp}–{x.maxTemp}°C</span>
                    </div>
                  )}
                  {!off && x.kind === "media" && (
                    <div className="stack" style={{ gap: 6, marginTop: 8 }}>
                      <div className="muted small">{s.title || (s.playing ? "Playing" : "Paused")}</div>
                      <div className="row" style={{ gap: 6, justifyContent: "flex-start" }}>
                        <button className="btn sm" disabled={busy === x.id} onClick={() => send(s.playing ? "pause" : "play")}>{s.playing ? "Pause" : "Play"}</button>
                        <button className="btn sm ghost" disabled={busy === x.id} onClick={() => send("next")}>Skip</button>
                      </div>
                      <label className="small muted">Volume {s.volume ?? "–"} (max {x.maxVolume})<input type="range" min={0} max={x.maxVolume} defaultValue={s.volume ?? 30} key={`${x.id}:${s.volume}`} onPointerUp={(e) => send("volume", (e.target as HTMLInputElement).value)} onKeyUp={(e) => e.key.startsWith("Arrow") && send("volume", (e.target as HTMLInputElement).value)} style={{ width: "100%" }} /></label>
                    </div>
                  )}
                  {!off && x.kind === "scene" && <button className="btn sm" style={{ marginTop: 8 }} disabled={busy === x.id} onClick={() => send("activate")}>Activate</button>}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
