"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "./Toasts";

type Dev = { id: string; name: string; kind: string };
const ACTS: Record<string, [string, string, boolean][]> = {
  light: [["on", "On", false], ["off", "Off", false], ["brightness", "Brightness %", true]],
  switch: [["on", "On", false], ["off", "Off", false]],
  climate: [["setpoint", "Set to °C", true], ["mode", "Mode (heat/cool/auto/off)", true], ["off", "Off", false]],
  media: [["play", "Play", false], ["pause", "Pause", false], ["volume", "Volume", true]],
  scene: [["activate", "Activate", false]],
};
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Builds a scene: a list of device settings, optionally run on chosen days at a time. */
export function SceneBuilder({ endpoint, devices }: { endpoint: string; devices: Dev[] }) {
  const router = useRouter();
  const [steps, setSteps] = useState<{ deviceId: string; action: string; value: string }[]>([{ deviceId: devices[0]?.id ?? "", action: "on", value: "" }]);
  const [days, setDays] = useState<number[]>([]);
  const kindOf = (id: string) => devices.find((d) => d.id === id)?.kind ?? "light";
  return (
    <form className="panel stack" onSubmit={async (e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const r = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "scene", name: f.get("name"), staffAllowed: f.get("staffAllowed"), at: f.get("at"), days, steps }) });
      const j = await r.json();
      toast(r.ok ? j.message : j.error, { kind: r.ok ? "ok" : "err" });
      if (r.ok) { (e.target as HTMLFormElement).reset(); setDays([]); router.refresh(); }
    }}>
      <h3>New scene</h3>
      <label className="field">Name<input name="name" required maxLength={40} placeholder="Match on" /></label>
      {steps.map((s, i) => (
        <div key={i} className="row wrap" style={{ gap: 6 }}>
          <select value={s.deviceId} onChange={(e) => setSteps(steps.map((x, j) => (j === i ? { deviceId: e.target.value, action: ACTS[kindOf(e.target.value)][0][0], value: "" } : x)))}>
            {devices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select value={s.action} onChange={(e) => setSteps(steps.map((x, j) => (j === i ? { ...x, action: e.target.value } : x)))}>
            {ACTS[kindOf(s.deviceId)].map(([a, l]) => <option key={a} value={a}>{l}</option>)}
          </select>
          {ACTS[kindOf(s.deviceId)].find(([a]) => a === s.action)?.[2] && <input className="field-input" style={{ width: 90 }} value={s.value} onChange={(e) => setSteps(steps.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} placeholder="value" />}
          <button type="button" className="btn sm ghost" onClick={() => setSteps(steps.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      <button type="button" className="btn sm ghost" style={{ alignSelf: "flex-start" }} onClick={() => setSteps([...steps, { deviceId: devices[0]?.id ?? "", action: ACTS[devices[0]?.kind ?? "light"][0][0], value: "" }])}>Add a device</button>
      <div className="row wrap" style={{ gap: 6, justifyContent: "flex-start" }}>
        <span className="small muted">Run automatically on</span>
        {DAYS.map((d, i) => <label key={d} className="toggle small"><input type="checkbox" checked={days.includes(i)} onChange={(e) => setDays(e.target.checked ? [...days, i] : days.filter((x) => x !== i))} /> {d}</label>)}
        <span className="small muted">at</span><input name="at" type="time" className="field-input" style={{ width: 110 }} />
      </div>
      <label className="toggle"><input type="checkbox" name="staffAllowed" defaultChecked /> Staff can run it</label>
      <button className="btn sm" style={{ alignSelf: "flex-start" }}>Save scene</button>
    </form>
  );
}
