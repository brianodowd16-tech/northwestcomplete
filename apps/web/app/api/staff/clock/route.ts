import { clock, openShift } from "@round/db/growth";
import { currentStaff, errorJson, json } from "@/lib/server";

export async function GET() {
  const staff = await currentStaff();
  if (!staff) return json({ error: "Sign in" }, 401);
  const s = await openShift(staff);
  return json({ clockedIn: !!s, since: s?.clockIn ?? null });
}

export async function POST(req: Request) {
  try {
    const staff = await currentStaff();
    if (!staff) return json({ error: "Sign in" }, 401);
    const { action } = (await req.json()) as { action: "in" | "out" };
    const s = await clock(staff, action === "out" ? "out" : "in");
    return json({ clockedIn: !s.clockOut, since: s.clockIn });
  } catch (e) {
    return errorJson(e);
  }
}
