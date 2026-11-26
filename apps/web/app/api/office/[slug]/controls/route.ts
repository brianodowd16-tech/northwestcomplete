import { haBaseUrl, publicHttpsUrl, type DeviceKind } from "@round/core";
import * as c from "@round/db/controls";
import { removeIntegration, saveIntegration } from "@round/db/integrations";
import { randomBytes } from "node:crypto";
import { discover } from "@/lib/controls";
import { managerFor } from "@/lib/office";
import { errorJson, json, secretsKey } from "@/lib/server";

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const m = await managerFor((await ctx.params).slug);
    if (m instanceof Response) return m;
    const b = (await req.json()) as Record<string, unknown>;
    const s = (k: string) => String(b[k] ?? "").trim();
    const on = (k: string) => b[k] === "on" || b[k] === true;
    const key = secretsKey();
    switch (b.action) {
      case "ha": {
        if (!key) return json({ error: "SECRETS_KEY isn't set on the server" }, 500);
        if (s("token").length < 20) return json({ error: "Paste a long-lived access token from your Home Assistant profile" }, 400);
        await saveIntegration(m.venue, "homeassistant", { baseUrl: haBaseUrl(s("url")) }, s("token"), key);
        return json({ message: `Connected. ${await discover(m.venue)} found` });
      }
      case "lifx":
        if (!key) return json({ error: "SECRETS_KEY isn't set on the server" }, 500);
        if (s("token").length < 20) return json({ error: "Paste a LIFX personal access token" }, 400);
        await saveIntegration(m.venue, "lifx", {}, s("token"), key);
        return json({ message: `Connected. ${await discover(m.venue)} found` });
      case "webhook": {
        if (!key) return json({ error: "SECRETS_KEY isn't set on the server" }, 500);
        if (!publicHttpsUrl(s("url"))) return json({ error: "Enter a public https:// address" }, 400);
        const secret = randomBytes(24).toString("base64url");
        await saveIntegration(m.venue, "controls_webhook", { url: s("url") }, secret, key);
        return json({ message: "Building system connected. Give your integrator this secret", secret });
      }
      case "disconnect": {
        const kind = s("kind") === "lifx" ? "lifx" : s("kind") === "webhook" ? "controls_webhook" : "homeassistant";
        await removeIntegration(m.venue, kind);
        return json({ message: "Disconnected" });
      }
      case "discover": return json({ message: await discover(m.venue) });
      case "device":
        await c.updateDevice(m.venue, s("id"), { name: s("name"), zone: s("zone"), enabled: on("enabled"), staffAllowed: on("staffAllowed"), minTemp: b.minTemp !== undefined ? Number(b.minTemp) : undefined, maxTemp: b.maxTemp !== undefined ? Number(b.maxTemp) : undefined, maxVolume: b.maxVolume !== undefined ? Number(b.maxVolume) : undefined });
        return json({ message: "Saved" });
      case "addDevice": await c.addWebhookDevice(m.venue, { externalId: s("externalId"), kind: s("kind") as DeviceKind, name: s("name"), zone: s("zone") }); return json({ message: "Device added" });
      case "removeDevice": await c.removeDevice(m.venue, s("id")); return json({ message: "Removed" });
      case "scene": {
        const steps = Array.isArray(b.steps) ? (b.steps as { deviceId: string; action: string; value?: string }[]) : [];
        const days = Array.isArray(b.days) ? (b.days as number[]) : [];
        await c.saveScene(m.venue, { id: s("id") || undefined, name: s("name"), steps: steps.map((x) => ({ deviceId: String(x.deviceId), action: String(x.action), ...(x.value !== undefined && x.value !== "" ? { value: isNaN(Number(x.value)) ? String(x.value) : Number(x.value) } : {}) })), days, at: s("at") || null, staffAllowed: on("staffAllowed") });
        return json({ message: "Scene saved" });
      }
      case "deleteScene": await c.deleteScene(m.venue, s("id")); return json({ message: "Scene deleted" });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return errorJson(e);
  }
}
