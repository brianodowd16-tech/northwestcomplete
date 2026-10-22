import { stationDockets } from "@round/db/services";
import { currentStaff, errorJson, json } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const staff = await currentStaff();
    if (!staff) return json({ error: "Sign in" }, 401);
    const station = new URL(req.url).searchParams.get("station") === "kitchen" ? "kitchen" : "bar";
    return json({ dockets: await stationDockets(staff, station) });
  } catch (e) {
    return errorJson(e);
  }
}
