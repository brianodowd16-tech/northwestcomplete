// Venue controls: lights, heating/cooling, music players, switches (fans, extractors,
// signage) and scenes, through the venue's own control system. Adapters:
//  - Home Assistant (REST API, long-lived token): the usual hub for Hue, KNX/DALI, Daikin,
//    Mitsubishi, Nest, Tado, Sonos, Modbus/BACnet gateways, etc.
//  - LIFX cloud API (token).
//  - Signed webhook to a building management system or integrator.
// Rules here: which actions each kind takes, value limits, and state normalisation.
import { createHmac } from "node:crypto";

export type DeviceKind = "light" | "climate" | "media" | "switch" | "scene";
export type ControlAction = "on" | "off" | "brightness" | "setpoint" | "mode" | "play" | "pause" | "next" | "volume" | "activate";

export class ControlError extends Error {}

export const ACTIONS: Record<DeviceKind, ControlAction[]> = {
  light: ["on", "off", "brightness"],
  climate: ["setpoint", "mode", "off"],
  media: ["play", "pause", "next", "volume"],
  switch: ["on", "off"],
  scene: ["activate"],
};

export const CLIMATE_MODES = ["heat", "cool", "heat_cool", "auto", "fan_only", "off"] as const;

export interface DeviceLimits { minTemp: number; maxTemp: number; maxVolume: number }

/**
 * Checks an action against the device kind and the manager's limits. Heating setpoints are
 * kept within min/max (staff can't run the heating at 30°C); volume within the ceiling.
 * Returns the value to send.
 */
export function checkAction(kind: DeviceKind, action: string, value: unknown, limits: DeviceLimits): number | string | undefined {
  if (!(ACTIONS[kind] as string[]).includes(action)) throw new ControlError(`A ${kind} can't do "${action}"`);
  const n = Number(value);
  if (action === "brightness") {
    if (!Number.isFinite(n) || n < 1 || n > 100) throw new ControlError("Brightness is 1 to 100%");
    return Math.round(n);
  }
  if (action === "setpoint") {
    if (!Number.isFinite(n)) throw new ControlError("Choose a temperature");
    const t = Math.round(n * 2) / 2;
    if (t < limits.minTemp || t > limits.maxTemp) throw new ControlError(`Keep it between ${limits.minTemp}°C and ${limits.maxTemp}°C (set by your manager)`);
    return t;
  }
  if (action === "volume") {
    if (!Number.isFinite(n) || n < 0 || n > 100) throw new ControlError("Volume is 0 to 100");
    if (n > limits.maxVolume) throw new ControlError(`Volume is capped at ${limits.maxVolume} (set by your manager)`);
    return Math.round(n);
  }
  if (action === "mode") {
    if (!(CLIMATE_MODES as readonly string[]).includes(String(value))) throw new ControlError("Choose heat, cool, auto, fan or off");
    return String(value);
  }
  return undefined;
}

export interface DeviceState {
  available: boolean;
  on?: boolean;
  brightness?: number;
  current?: number;
  target?: number;
  mode?: string;
  modes?: string[];
  playing?: boolean;
  volume?: number;
  title?: string;
}

export interface FoundDevice { externalId: string; kind: DeviceKind; name: string; zone: string }

// ---------------------------------------------------------------- Home Assistant

const HA_KIND: Record<string, DeviceKind> = { light: "light", climate: "climate", media_player: "media", switch: "switch", fan: "switch", scene: "scene" };

export function haBaseUrl(url: string): string {
  const u = publicHttpsUrl(String(url ?? "").trim().replace(/\/+$/, ""));
  if (!u || new URL(u).pathname !== "/") throw new ControlError("Enter your Home Assistant's public https address, like https://yourvenue.ui.nabu.casa");
  return u.replace(/\/$/, "");
}

type HaState = { entity_id: string; state: string; attributes: Record<string, unknown> };

export function haDeviceState(s: HaState | undefined): DeviceState {
  if (!s || s.state === "unavailable" || s.state === "unknown") return { available: false };
  const a = s.attributes;
  const domain = s.entity_id.split(".")[0];
  if (domain === "light") return { available: true, on: s.state === "on", brightness: typeof a.brightness === "number" ? Math.round((a.brightness / 255) * 100) : undefined };
  if (domain === "climate") return { available: true, mode: s.state, modes: (a.hvac_modes as string[]) ?? [], current: a.current_temperature as number, target: a.temperature as number };
  if (domain === "media_player") return { available: true, playing: s.state === "playing", volume: typeof a.volume_level === "number" ? Math.round(a.volume_level * 100) : undefined, title: [a.media_artist, a.media_title].filter(Boolean).join(" – ") || undefined };
  return { available: true, on: s.state === "on" };
}

export class HomeAssistantClient {
  constructor(private baseUrl: string, private token: string, private fetchImpl: typeof fetch = fetch) {}

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new ControlError(`Home Assistant answered ${res.status}${res.status === 401 ? ": check the access token" : ""}`);
    return (await res.json()) as T;
  }

  states() {
    return this.call<HaState[]>("GET", "/api/states");
  }

  /** Lights, climate, media players, switches, fans and scenes, grouped by area name when the entity id carries one. */
  async discover(): Promise<FoundDevice[]> {
    return (await this.states())
      .filter((s) => HA_KIND[s.entity_id.split(".")[0]])
      .map((s) => ({ externalId: s.entity_id, kind: HA_KIND[s.entity_id.split(".")[0]], name: String(s.attributes.friendly_name ?? s.entity_id), zone: "" }));
  }

  async send(entityId: string, kind: DeviceKind, action: ControlAction, value?: number | string) {
    const domain = entityId.split(".")[0];
    const target = { entity_id: entityId };
    const svc: [string, string, Record<string, unknown>] =
      action === "on" ? [domain, "turn_on", target]
      : action === "off" ? [domain, "turn_off", target]
      : action === "brightness" ? ["light", "turn_on", { ...target, brightness_pct: value }]
      : action === "setpoint" ? ["climate", "set_temperature", { ...target, temperature: value }]
      : action === "mode" ? ["climate", "set_hvac_mode", { ...target, hvac_mode: value }]
      : action === "play" ? ["media_player", "media_play", target]
      : action === "pause" ? ["media_player", "media_pause", target]
      : action === "next" ? ["media_player", "media_next_track", target]
      : action === "volume" ? ["media_player", "volume_set", { ...target, volume_level: Number(value) / 100 }]
      : ["scene", "turn_on", target];
    if (kind === "climate" && action === "off") svc.splice(0, 3, "climate", "set_hvac_mode", { ...target, hvac_mode: "off" });
    await this.call("POST", `/api/services/${svc[0]}/${svc[1]}`, svc[2]);
  }
}

// ---------------------------------------------------------------- LIFX

export class LifxClient {
  constructor(private token: string, private fetchImpl: typeof fetch = fetch) {}

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.fetchImpl(`https://api.lifx.com/v1${path}`, { method, headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new ControlError(`LIFX answered ${res.status}${res.status === 401 ? ": check the token" : ""}`);
    return (await res.json()) as T;
  }

  lights() {
    return this.call<{ id: string; label: string; power: string; brightness: number; connected: boolean; group?: { name: string } }[]>("GET", "/lights/all");
  }

  async discover(): Promise<FoundDevice[]> {
    return (await this.lights()).map((l) => ({ externalId: l.id, kind: "light" as const, name: l.label, zone: l.group?.name ?? "" }));
  }

  async send(id: string, action: ControlAction, value?: number | string) {
    const state = action === "on" ? { power: "on" } : action === "off" ? { power: "off" } : { power: "on", brightness: Number(value) / 100 };
    await this.call("PUT", `/lights/id:${encodeURIComponent(id)}/state`, { ...state, duration: 1 });
  }
}

export const lifxState = (l: { power: string; brightness: number; connected: boolean } | undefined): DeviceState =>
  !l || !l.connected ? { available: false } : { available: true, on: l.power === "on", brightness: Math.round(l.brightness * 100) };

// ---------------------------------------------------------------- building management (signed webhook)

/** The body and signature for a control sent to a BMS or integrator's endpoint. */
export function webhookControl(secret: string, venue: string, device: { externalId: string; kind: DeviceKind; name: string }, action: ControlAction, value: number | string | undefined, by: string) {
  const body = JSON.stringify({ type: "control", venue, device: device.externalId, kind: device.kind, name: device.name, action, value: value ?? null, by, at: new Date().toISOString() });
  return { body, signature: `sha256=${createHmac("sha256", secret).update(body).digest("hex")}` };
}

/** Whether a scheduled scene is due at this venue-local minute (once per day and time). */
export function sceneDue(scene: { days: number[]; at: string | null }, localDay: number, localHHMM: string) {
  return !!scene.at && scene.days.includes(localDay) && scene.at === localHHMM;
}

/**
 * An https address on the public internet. Addresses venues type in (Home Assistant, building
 * systems, payroll and hotel endpoints) are called by Complete's server, so local and private
 * network addresses are refused (no reaching into Complete's own network).
 */
export function publicHttpsUrl(input: string): string | null {
  let u: URL;
  try { u = new URL(String(input ?? "").trim()); } catch { return null; }
  if (u.protocol !== "https:" || u.username || u.password) return null;
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || /\.(localhost|local|internal|lan|home|corp)$/.test(h) || !h.includes(".") && !h.includes(":")) return null;
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127) || a >= 224) return null;
  }
  if (h.includes(":") && (h === "::1" || /^f[cd]/.test(h) || /^fe[89ab]/.test(h) || h.startsWith("::ffff:"))) return null;
  return u.toString().replace(/\/$/, "");
}
