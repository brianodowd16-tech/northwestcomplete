import { pauseStation } from "@round/db/admin";
import { currentStaff, errorJson, json } from "@/lib/server";

export async function POST(req: Request) {
  try {
    const staff = await currentStaff();
    if (!staff) return json({ error: "Sign in" }, 401);
    const { station, minutes } = (await req.json()) as { station: "bar" | "kitchen"; minutes: number };
    await pauseStation(staff, station, Number(minutes));
    return json({ ok: true });
  } catch (e) {
    return errorJson(e);
  }
}
