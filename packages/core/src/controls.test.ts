import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { checkAction, haBaseUrl, haDeviceState, HomeAssistantClient, LifxClient, publicHttpsUrl, sceneDue, webhookControl } from "./index";

const limits = { minTemp: 17, maxTemp: 24, maxVolume: 70 };

describe("control rules", () => {
  it("only allows actions a device can do, within the manager's limits", () => {
    expect(checkAction("climate", "setpoint", 21.3, limits)).toBe(21.5);
    expect(() => checkAction("climate", "setpoint", 28, limits)).toThrow(/between 17°C and 24°C/);
    expect(() => checkAction("media", "volume", 90, limits)).toThrow(/capped at 70/);
    expect(checkAction("light", "brightness", "40", limits)).toBe(40);
    expect(() => checkAction("light", "setpoint", 20, limits)).toThrow(/can't do/);
    expect(() => checkAction("climate", "mode", "sauna", limits)).toThrow();
    expect(checkAction("scene", "activate", undefined, limits)).toBeUndefined();
  });

  it("refuses local and private addresses", () => {
    expect(publicHttpsUrl("https://mjs.ui.nabu.casa")).toBe("https://mjs.ui.nabu.casa");
    for (const bad of ["http://mjs.example.com", "https://localhost:8123", "https://192.168.1.20", "https://10.0.0.5", "https://169.254.169.254", "https://ha.local", "https://[::1]", "https://user:pw@x.example.com", "https://intranet"]) expect(publicHttpsUrl(bad)).toBeNull();
    expect(() => haBaseUrl("https://192.168.1.20:8123")).toThrow();
    expect(haBaseUrl("https://mjs.ui.nabu.casa/")).toBe("https://mjs.ui.nabu.casa");
  });

  it("runs scheduled scenes on the right weekday and minute", () => {
    expect(sceneDue({ days: [5, 6], at: "17:00" }, 5, "17:00")).toBe(true);
    expect(sceneDue({ days: [5, 6], at: "17:00" }, 4, "17:00")).toBe(false);
    expect(sceneDue({ days: [5], at: null }, 5, "17:00")).toBe(false);
  });

  it("signs building-system controls", () => {
    const { body, signature } = webhookControl("s3cret", "mj", { externalId: "ahu-1", kind: "climate", name: "Bar AC" }, "setpoint", 21, "Seán");
    expect(JSON.parse(body)).toMatchObject({ venue: "mj", device: "ahu-1", action: "setpoint", value: 21, by: "Seán" });
    expect(signature).toBe(`sha256=${createHmac("sha256", "s3cret").update(body).digest("hex")}`);
  });
});

describe("Home Assistant and LIFX", () => {
  const states = [
    { entity_id: "light.bar_pendants", state: "on", attributes: { friendly_name: "Bar pendants", brightness: 128 } },
    { entity_id: "climate.lounge", state: "heat", attributes: { friendly_name: "Lounge heating", current_temperature: 19.5, temperature: 21, hvac_modes: ["heat", "off"] } },
    { entity_id: "media_player.bar_speakers", state: "playing", attributes: { friendly_name: "Bar speakers", volume_level: 0.35, media_artist: "The Pogues", media_title: "Fairytale" } },
    { entity_id: "sensor.cellar_temp", state: "11", attributes: {} },
    { entity_id: "light.yard", state: "unavailable", attributes: {} },
  ];

  it("finds lights, climate and players, and reads their state", async () => {
    const f = vi.fn(async () => Response.json(states)) as unknown as typeof fetch;
    const ha = new HomeAssistantClient("https://mjs.ui.nabu.casa", "tok", f);
    expect((await ha.discover()).map((d) => [d.externalId, d.kind])).toEqual([["light.bar_pendants", "light"], ["climate.lounge", "climate"], ["media_player.bar_speakers", "media"], ["light.yard", "light"]]);
    expect(haDeviceState(states[0])).toEqual({ available: true, on: true, brightness: 50 });
    expect(haDeviceState(states[1])).toMatchObject({ current: 19.5, target: 21, mode: "heat" });
    expect(haDeviceState(states[2])).toMatchObject({ playing: true, volume: 35, title: "The Pogues – Fairytale" });
    expect(haDeviceState(states[4])).toEqual({ available: false });
  });

  it("calls the right Home Assistant services", async () => {
    const calls: [string, unknown][] = [];
    const f = vi.fn(async (url: string, init?: RequestInit) => { calls.push([url.replace("https://h.example.com/api/services/", ""), JSON.parse(String(init?.body))]); return Response.json([]); }) as unknown as typeof fetch;
    const ha = new HomeAssistantClient("https://h.example.com", "tok", f);
    await ha.send("light.bar", "light", "brightness", 40);
    await ha.send("climate.lounge", "climate", "setpoint", 21.5);
    await ha.send("climate.lounge", "climate", "off");
    await ha.send("media_player.bar", "media", "volume", 35);
    await ha.send("scene.closing", "scene", "activate");
    expect(calls).toEqual([
      ["light/turn_on", { entity_id: "light.bar", brightness_pct: 40 }],
      ["climate/set_temperature", { entity_id: "climate.lounge", temperature: 21.5 }],
      ["climate/set_hvac_mode", { entity_id: "climate.lounge", hvac_mode: "off" }],
      ["media_player/volume_set", { entity_id: "media_player.bar", volume_level: 0.35 }],
      ["scene/turn_on", { entity_id: "scene.closing" }],
    ]);
  });

  it("sets LIFX lights by id", async () => {
    const calls: [string, string, unknown][] = [];
    const f = vi.fn(async (url: string, init?: RequestInit) => { calls.push([init?.method ?? "GET", url, init?.body ? JSON.parse(String(init.body)) : null]); return Response.json({ results: [] }); }) as unknown as typeof fetch;
    await new LifxClient("tok", f).send("d073d5", "brightness", 30);
    expect(calls[0]).toEqual(["PUT", "https://api.lifx.com/v1/lights/id:d073d5/state", { power: "on", brightness: 0.3, duration: 1 }]);
  });
});
