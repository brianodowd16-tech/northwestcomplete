// Venue controls: the devices a venue's control system exposes, which ones staff may use
// (and within what limits), saved scenes with optional schedules, and the log of every action.
import { ControlError, type DeviceKind, type FoundDevice } from "@round/core";
import { and, asc, desc, eq, inArray, isNull, notInArray } from "drizzle-orm";
import { systemDb, withTenant } from "./index";
import * as t from "./schema";
import { NotFound, type Venue } from "./services";

export type Device = typeof t.venueDevice.$inferSelect;
export type Scene = typeof t.venueScene.$inferSelect;
export type ControlProvider = Device["provider"];

/** Adds newly found devices (hidden until a manager turns them on) and flags ones that disappeared. */
export async function syncDevices(venue: Venue, provider: ControlProvider, found: FoundDevice[]) {
  return withTenant(venue.tenantId, async (tx) => {
    for (const d of found)
      await tx
        .insert(t.venueDevice)
        .values({ tenantId: venue.tenantId, venueId: venue.id, provider, externalId: d.externalId, kind: d.kind, name: d.name.slice(0, 80), zone: d.zone.slice(0, 40) })
        .onConflictDoUpdate({ target: [t.venueDevice.venueId, t.venueDevice.provider, t.venueDevice.externalId], set: { missingSince: null } });
    const ids = found.map((d) => d.externalId);
    await tx.update(t.venueDevice).set({ missingSince: new Date() }).where(and(eq(t.venueDevice.venueId, venue.id), eq(t.venueDevice.provider, provider), isNull(t.venueDevice.missingSince), ids.length ? notInArray(t.venueDevice.externalId, ids) : undefined));
    return { found: found.length };
  });
}

/** A device a building system exposes through the webhook, added by hand. */
export async function addWebhookDevice(venue: Venue, input: { externalId: string; kind: DeviceKind; name: string; zone?: string }) {
  if (!/^[\w.:\-/]{1,80}$/.test(input.externalId)) throw new ControlError("Device id: letters, numbers and . : - / only");
  if (!["light", "climate", "media", "switch", "scene"].includes(input.kind)) throw new ControlError("Choose a kind");
  const name = String(input.name ?? "").trim().slice(0, 80);
  if (!name) throw new ControlError("Name the device");
  await syncDevices(venue, "webhook", [...(await devices(venue)).filter((d) => d.provider === "webhook").map((d) => ({ externalId: d.externalId, kind: d.kind, name: d.name, zone: d.zone })), { externalId: input.externalId, kind: input.kind, name, zone: input.zone ?? "" }]);
}

export async function devices(venue: Venue) {
  return withTenant(venue.tenantId, (tx) => tx.select().from(t.venueDevice).where(eq(t.venueDevice.venueId, venue.id)).orderBy(asc(t.venueDevice.zone), asc(t.venueDevice.sort), asc(t.venueDevice.name)));
}

export async function device(venue: Venue, id: string) {
  const [d] = await withTenant(venue.tenantId, (tx) => tx.select().from(t.venueDevice).where(and(eq(t.venueDevice.id, id), eq(t.venueDevice.venueId, venue.id))));
  if (!d) throw new NotFound("Device not found");
  return d;
}

/** Manager settings for a device: name, zone, shown, staff allowed, limits. */
export async function updateDevice(venue: Venue, id: string, input: { name?: string; zone?: string; enabled?: boolean; staffAllowed?: boolean; minTemp?: number; maxTemp?: number; maxVolume?: number }) {
  const cur = await device(venue, id);
  const minTemp = input.minTemp ?? cur.minTemp, maxTemp = input.maxTemp ?? cur.maxTemp, maxVolume = input.maxVolume ?? cur.maxVolume;
  if (!Number.isInteger(minTemp) || !Number.isInteger(maxTemp) || minTemp < 5 || maxTemp > 32 || minTemp >= maxTemp) throw new ControlError("Temperature limits: whole degrees between 5 and 32°C, lowest below highest");
  if (!Number.isInteger(maxVolume) || maxVolume < 1 || maxVolume > 100) throw new ControlError("Volume cap is 1 to 100");
  await withTenant(venue.tenantId, (tx) =>
    tx.update(t.venueDevice).set({
      ...(input.name !== undefined ? { name: input.name.trim().slice(0, 80) || cur.name } : {}),
      ...(input.zone !== undefined ? { zone: input.zone.trim().slice(0, 40) } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.staffAllowed !== undefined ? { staffAllowed: input.staffAllowed } : {}),
      minTemp, maxTemp, maxVolume,
    }).where(eq(t.venueDevice.id, id)),
  );
}

export async function removeDevice(venue: Venue, id: string) {
  await withTenant(venue.tenantId, (tx) => tx.delete(t.venueDevice).where(and(eq(t.venueDevice.id, id), eq(t.venueDevice.venueId, venue.id))));
}

// ---------------------------------------------------------------- scenes

export interface SceneInput { id?: string; name: string; steps: { deviceId: string; action: string; value?: number | string }[]; days?: number[]; at?: string | null; staffAllowed?: boolean }

export async function saveScene(venue: Venue, input: SceneInput) {
  const name = String(input.name ?? "").trim().slice(0, 40);
  if (!name) throw new ControlError("Name the scene");
  const mine = new Set((await devices(venue)).map((d) => d.id));
  const steps = (input.steps ?? []).filter((s) => mine.has(s.deviceId)).slice(0, 40);
  if (!steps.length) throw new ControlError("Add at least one device to the scene");
  const days = [...new Set((input.days ?? []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
  const at = input.at && /^([01]\d|2[0-3]):[0-5]\d$/.test(input.at) ? input.at : null;
  if (days.length && !at) throw new ControlError("Pick a time for the schedule");
  const values = { name, steps, days: at ? days : [], at: days.length ? at : null, staffAllowed: input.staffAllowed ?? true };
  return withTenant(venue.tenantId, async (tx) => {
    if (input.id) {
      const [r] = await tx.update(t.venueScene).set(values).where(and(eq(t.venueScene.id, input.id), eq(t.venueScene.venueId, venue.id))).returning();
      if (!r) throw new NotFound("Scene not found");
      return r;
    }
    const [r] = await tx.insert(t.venueScene).values({ tenantId: venue.tenantId, venueId: venue.id, ...values }).returning();
    return r;
  });
}

export async function scenes(venue: Venue) {
  return withTenant(venue.tenantId, (tx) => tx.select().from(t.venueScene).where(eq(t.venueScene.venueId, venue.id)).orderBy(asc(t.venueScene.name)));
}

export async function deleteScene(venue: Venue, id: string) {
  await withTenant(venue.tenantId, (tx) => tx.delete(t.venueScene).where(and(eq(t.venueScene.id, id), eq(t.venueScene.venueId, venue.id))));
}

/** Venues with at least one scheduled scene (for the minute job). */
export async function venuesWithSchedules() {
  const rows = await systemDb().selectDistinct({ venueId: t.venueScene.venueId }).from(t.venueScene);
  if (!rows.length) return [];
  return systemDb().select().from(t.venue).where(inArray(t.venue.id, rows.map((r) => r.venueId)));
}

// ---------------------------------------------------------------- log

/** Records an action. A scheduled run carries a run key: returns false if that run was already recorded. */
export async function logControl(venue: Venue, e: { actor: string; deviceId?: string | null; sceneId?: string | null; action: string; value?: string | number | null; ok: boolean; error?: string | null; runKey?: string }) {
  const r = await withTenant(venue.tenantId, (tx) =>
    tx.insert(t.controlLog).values({ tenantId: venue.tenantId, venueId: venue.id, actor: e.actor, deviceId: e.deviceId ?? null, sceneId: e.sceneId ?? null, action: e.action, value: e.value == null ? null : String(e.value), ok: e.ok, error: e.error?.slice(0, 300) ?? null, runKey: e.runKey ?? null }).onConflictDoNothing().returning({ id: t.controlLog.id }),
  );
  return r.length > 0;
}

export async function controlHistory(venue: Venue, limit = 50) {
  return withTenant(venue.tenantId, async (tx) => {
    const rows = await tx.select().from(t.controlLog).where(eq(t.controlLog.venueId, venue.id)).orderBy(desc(t.controlLog.createdAt)).limit(limit);
    const staff = await tx.select({ id: t.staffUser.id, name: t.staffUser.name }).from(t.staffUser).where(eq(t.staffUser.venueId, venue.id));
    return rows.map((r) => ({ ...r, who: r.actor.startsWith("staff:") ? staff.find((s) => `staff:${s.id}` === r.actor)?.name ?? "Staff" : r.actor === "schedule" ? "Schedule" : r.actor }));
  });
}

/** Recent actions on one device by one person (for rate limiting: 30 a minute). */
export async function recentActions(venue: Venue, actor: string, since: Date) {
  const rows = await withTenant(venue.tenantId, (tx) => tx.select({ at: t.controlLog.createdAt }).from(t.controlLog).where(and(eq(t.controlLog.venueId, venue.id), eq(t.controlLog.actor, actor))).orderBy(desc(t.controlLog.createdAt)).limit(40));
  return rows.filter((r) => r.at >= since).length;
}
