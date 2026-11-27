import { devices, scenes } from "@round/db/controls";
import { venueById } from "@round/db/services";
import { liveStates, runAction, runScene } from "@/lib/controls";
import { currentStaff, errorJson, json } from "@/lib/server";

/** The staff Controls screen: devices this person may use, their live state, and scenes. */
export async function GET() {
  try {
    const staff = await currentStaff();
    if (!staff) return json({ error: "Sign in" }, 401);
    const venue = await venueById(staff.venueId);
    const devs = (await devices(venue)).filter((d) => d.enabled && !d.missingSince && (staff.role === "admin" || d.staffAllowed));
    const { states, errors } = await liveStates(venue, devs);
    const sc = (await scenes(venue)).filter((s) => staff.role === "admin" || s.staffAllowed);
    return json({
      devices: devs.map((d) => ({ id: d.id, kind: d.kind, name: d.name, zone: d.zone, minTemp: d.minTemp, maxTemp: d.maxTemp, maxVolume: d.maxVolume, state: states[d.id] })),
      scenes: sc.map((s) => ({ id: s.id, name: s.name, schedule: s.at ? { days: s.days, at: s.at } : null })),
      errors,
    });
  } catch (e) {
    return errorJson(e);
  }
}

export async function POST(req: Request) {
  try {
    const staff = await currentStaff();
    if (!staff) return json({ error: "Sign in" }, 401);
    const venue = await venueById(staff.venueId);
    const b = (await req.json()) as { deviceId?: string; action?: string; value?: unknown; sceneId?: string };
    if (b.sceneId) {
      const r = await runScene(venue, String(b.sceneId), { staff });
      return r.failed ? json({ error: `${r.ok} done, ${r.failed} didn't respond` }, 424) : json({ message: "Scene set" });
    }
    await runAction(venue, staff, String(b.deviceId ?? ""), String(b.action ?? ""), b.value);
    return json({ ok: true });
  } catch (e) {
    return errorJson(e);
  }
}
