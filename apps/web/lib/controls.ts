import "server-only";
import {
  checkAction, ControlError, decryptSecret, haBaseUrl, haDeviceState, HomeAssistantClient, LifxClient, lifxState, localDate, sceneDue, webhookControl,
  type ControlAction, type DeviceState,
} from "@round/core";
import * as c from "@round/db/controls";
import { loadIntegration } from "@round/db/integrations";
import { recordError } from "@round/db/platform";
import type { Staff, Venue } from "@round/db/services";
import { secretsKey } from "./server";

async function secretOf(venue: Venue, kind: "homeassistant" | "lifx" | "controls_webhook") {
  const row = await loadIntegration(venue, kind);
  const key = secretsKey();
  if (!row?.secretEnc || !key) return null;
  return { secret: decryptSecret(row.secretEnc, key), config: row.config as Record<string, string> };
}

export async function clients(venue: Venue, fetchImpl: typeof fetch = fetch) {
  const [ha, lifx, hook] = await Promise.all([secretOf(venue, "homeassistant"), secretOf(venue, "lifx"), secretOf(venue, "controls_webhook")]);
  return {
    ha: ha ? new HomeAssistantClient(haBaseUrl(ha.config.baseUrl), ha.secret, fetchImpl) : null,
    lifx: lifx ? new LifxClient(lifx.secret, fetchImpl) : null,
    hook: hook ? { url: hook.config.url, secret: hook.secret } : null,
  };
}

/** Finds devices on every connected system and adds new ones (hidden until a manager turns them on). */
export async function discover(venue: Venue) {
  const k = await clients(venue);
  const out: string[] = [];
  if (k.ha) out.push(`Home Assistant: ${(await c.syncDevices(venue, "homeassistant", await k.ha.discover())).found} devices`);
  if (k.lifx) out.push(`LIFX: ${(await c.syncDevices(venue, "lifx", await k.lifx.discover())).found} lights`);
  if (!out.length) throw new ControlError("Connect Home Assistant or LIFX first");
  return out.join(" · ");
}

/** Live state for each device (one call per system). A system that can't be reached shows its devices as unavailable. */
export async function liveStates(venue: Venue, devs: c.Device[]): Promise<{ states: Record<string, DeviceState>; errors: string[] }> {
  const k = await clients(venue);
  const states: Record<string, DeviceState> = {}, errors: string[] = [];
  if (devs.some((d) => d.provider === "homeassistant")) {
    try {
      const all = k.ha ? await k.ha.states() : [];
      for (const d of devs.filter((x) => x.provider === "homeassistant")) states[d.id] = haDeviceState(all.find((s) => s.entity_id === d.externalId));
    } catch (e) { errors.push(`Home Assistant: ${e instanceof Error ? e.message : e}`); }
  }
  if (devs.some((d) => d.provider === "lifx")) {
    try {
      const all = k.lifx ? await k.lifx.lights() : [];
      for (const d of devs.filter((x) => x.provider === "lifx")) states[d.id] = lifxState(all.find((l) => l.id === d.externalId));
    } catch (e) { errors.push(`LIFX: ${e instanceof Error ? e.message : e}`); }
  }
  for (const d of devs.filter((x) => x.provider === "webhook")) states[d.id] = { available: !!k.hook };
  for (const d of devs) states[d.id] ??= { available: false };
  return { states, errors };
}

async function send(venue: Venue, d: c.Device, action: ControlAction, value: number | string | undefined, by: string) {
  const k = await clients(venue);
  if (d.provider === "homeassistant") {
    if (!k.ha) throw new ControlError("Home Assistant isn't connected");
    await k.ha.send(d.externalId, d.kind, action, value);
  } else if (d.provider === "lifx") {
    if (!k.lifx) throw new ControlError("LIFX isn't connected");
    await k.lifx.send(d.externalId, action, value);
  } else {
    if (!k.hook) throw new ControlError("The building system isn't connected");
    const { body, signature } = webhookControl(k.hook.secret, venue.slug, d, action, value, by);
    const res = await fetch(k.hook.url, { method: "POST", headers: { "Content-Type": "application/json", "X-Complete-Signature": signature }, body, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new ControlError(`The building system answered ${res.status}`);
  }
}

/**
 * One action from the Controls screen. Staff may only use devices a manager allowed, within
 * the manager's limits; 30 actions a minute each; every action is logged, worked or not.
 */
export async function runAction(venue: Venue, staff: Staff, deviceId: string, action: string, value: unknown) {
  const d = await c.device(venue, deviceId);
  if (!d.enabled || (staff.role !== "admin" && !d.staffAllowed)) throw new ControlError("Ask a manager: this one is managers only");
  const v = checkAction(d.kind, action, value, d);
  const actor = `staff:${staff.id}`;
  if ((await c.recentActions(venue, actor, new Date(Date.now() - 60_000))) >= 30) throw new ControlError("Too many changes at once. Give it a minute.");
  try {
    await send(venue, d, action as ControlAction, v, staff.name);
    await c.logControl(venue, { actor, deviceId: d.id, action, value: v ?? null, ok: true });
  } catch (e) {
    await c.logControl(venue, { actor, deviceId: d.id, action, value: v ?? null, ok: false, error: e instanceof Error ? e.message : String(e) });
    throw e instanceof ControlError ? e : new ControlError(`${d.name} didn't respond. Try again, or use the wall control.`);
  }
}

/** Runs a scene's steps in order; each step keeps the device's limits. Returns how many worked. */
export async function runScene(venue: Venue, sceneId: string, by: { staff?: Staff; runKey?: string }) {
  const scene = (await c.scenes(venue)).find((s) => s.id === sceneId);
  if (!scene) throw new ControlError("Scene not found");
  if (by.staff && by.staff.role !== "admin" && !scene.staffAllowed) throw new ControlError("Ask a manager: this scene is managers only");
  const actor = by.staff ? `staff:${by.staff.id}` : "schedule";
  // A scheduled run is claimed first, so two app instances never run it twice.
  if (by.runKey && !(await c.logControl(venue, { actor, sceneId, action: "scene", value: scene.name, ok: true, runKey: by.runKey }))) return { ok: 0, failed: 0, skipped: true };
  const devs = await c.devices(venue);
  let ok = 0;
  const failed: string[] = [];
  for (const step of scene.steps) {
    const d = devs.find((x) => x.id === step.deviceId);
    if (!d) continue;
    try {
      await send(venue, d, step.action as ControlAction, checkAction(d.kind, step.action, step.value, d), by.staff?.name ?? "Schedule");
      ok++;
    } catch (e) {
      failed.push(`${d.name}: ${e instanceof Error ? e.message : e}`);
    }
  }
  if (!by.runKey) await c.logControl(venue, { actor, sceneId, action: "scene", value: scene.name, ok: failed.length === 0, error: failed.join("; ") || null });
  else if (failed.length) await c.logControl(venue, { actor, sceneId, action: "scene", value: scene.name, ok: false, error: failed.join("; ") });
  return { ok, failed: failed.length, skipped: false };
}

/** Every minute: run scenes scheduled for this venue-local weekday and time. */
export async function sceneTick(now = new Date()) {
  let ran = 0;
  for (const v of (await c.venuesWithSchedules()) as Venue[]) {
    const hhmm = new Intl.DateTimeFormat("en-GB", { timeZone: v.timezone, hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
    const day = new Date(`${localDate(now, v.timezone)}T12:00:00Z`).getUTCDay();
    for (const s of (await c.scenes(v)).filter((x) => sceneDue(x, day, hhmm))) {
      try {
        const r = await runScene(v, s.id, { runKey: `scene:${s.id}:${localDate(now, v.timezone)}:${hhmm}` });
        if (!r.skipped) ran++;
      } catch (e) {
        await recordError(e, `scene ${v.slug}`);
      }
    }
  }
  return ran;
}
