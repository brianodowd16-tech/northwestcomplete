import { setSongStatus, songRequests } from "@round/db/groups";
import { currentStaff, errorJson, json } from "@/lib/server";

export async function GET() {
  const staff = await currentStaff();
  if (!staff) return json({ error: "Sign in" }, 401);
  return json({ songs: await songRequests(staff) });
}

export async function POST(req: Request) {
  try {
    const staff = await currentStaff();
    if (!staff) return json({ error: "Sign in" }, 401);
    const b = (await req.json()) as { id?: string; status?: string };
    await setSongStatus(staff, String(b.id ?? ""), b.status === "declined" ? "declined" : "played");
    return json({ ok: true });
  } catch (e) {
    return errorJson(e);
  }
}
