import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as c from "./controls";
import { pool } from "./index";
import { seed } from "./seed";
import * as svc from "./services";
import { resetDatabase } from "./setup";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://round:round@localhost:5432/round_test";
let mj: svc.Venue, drum: svc.Venue;
beforeAll(async () => {
  await seed(await resetDatabase());
  mj = await svc.venueBySlug("mj-oconnors");
  drum = await svc.venueBySlug("drumhierny");
});
afterAll(() => pool().end());

describe("venue controls", () => {
  it("adds found devices hidden, keeps settings on re-sync and flags devices that disappear", async () => {
    await c.syncDevices(mj, "homeassistant", [{ externalId: "light.bar", kind: "light", name: "Bar pendants", zone: "" }, { externalId: "climate.lounge", kind: "climate", name: "Lounge heating", zone: "" }]);
    let devs = await c.devices(mj);
    expect(devs.every((d) => !d.enabled && !d.staffAllowed)).toBe(true);
    const heat = devs.find((d) => d.kind === "climate")!;
    await c.updateDevice(mj, heat.id, { enabled: true, staffAllowed: true, zone: "Lounge", minTemp: 18, maxTemp: 22 });
    await c.syncDevices(mj, "homeassistant", [{ externalId: "climate.lounge", kind: "climate", name: "Lounge heating", zone: "" }]);
    devs = await c.devices(mj);
    expect(devs.find((d) => d.id === heat.id)).toMatchObject({ enabled: true, zone: "Lounge", minTemp: 18, maxTemp: 22, missingSince: null });
    expect(devs.find((d) => d.externalId === "light.bar")!.missingSince).not.toBeNull();
    await expect(c.updateDevice(mj, heat.id, { minTemp: 25, maxTemp: 20 })).rejects.toThrow(/limits/);
    await expect(c.device(drum, heat.id)).rejects.toThrow(/not found/); // other venues can't see it
  });

  it("saves scenes only with the venue's own devices and a time for schedules", async () => {
    const [d] = await c.devices(mj);
    const [other] = await (async () => { await c.syncDevices(drum, "lifx", [{ externalId: "d073d5", kind: "light", name: "Deck", zone: "" }]); return c.devices(drum); })();
    await expect(c.saveScene(mj, { name: "Closing", steps: [{ deviceId: other.id, action: "off" }] })).rejects.toThrow(/at least one device/);
    await expect(c.saveScene(mj, { name: "Closing", steps: [{ deviceId: d.id, action: "off" }], days: [5] })).rejects.toThrow(/time/);
    const s = await c.saveScene(mj, { name: "Closing", steps: [{ deviceId: d.id, action: "off" }, { deviceId: other.id, action: "off" }], days: [5, 6, 9], at: "23:45" });
    expect(s).toMatchObject({ days: [5, 6], at: "23:45", steps: [{ deviceId: d.id, action: "off" }] });
    expect((await c.venuesWithSchedules()).map((v) => v.slug)).toContain("mj-oconnors");
  });

  it("logs every action and runs each scheduled scene once", async () => {
    const [s] = await c.scenes(mj);
    expect(await c.logControl(mj, { actor: "schedule", sceneId: s.id, action: "scene", ok: true, runKey: `scene:${s.id}:2026-11-27:23:45` })).toBe(true);
    expect(await c.logControl(mj, { actor: "schedule", sceneId: s.id, action: "scene", ok: true, runKey: `scene:${s.id}:2026-11-27:23:45` })).toBe(false);
    await c.logControl(mj, { actor: "staff:x", action: "setpoint", value: 21, ok: false, error: "offline" });
    const h = await c.controlHistory(mj);
    expect(h.map((x) => x.who)).toEqual(["Staff", "Schedule"]);
    expect(await c.recentActions(mj, "staff:x", new Date(Date.now() - 60_000))).toBe(1);
  });

  it("adds building-system devices by id", async () => {
    await c.addWebhookDevice(mj, { externalId: "ahu-1", kind: "climate", name: "Bar AC", zone: "Bar" });
    await expect(c.addWebhookDevice(mj, { externalId: "bad id!", kind: "climate", name: "x" })).rejects.toThrow(/Device id/);
    expect((await c.devices(mj)).find((d) => d.provider === "webhook")).toMatchObject({ externalId: "ahu-1", name: "Bar AC", enabled: false });
  });
});
