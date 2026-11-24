import { setBookingStatus } from "@round/db/growth";
import { currentStaff, errorJson, json } from "@/lib/server";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const staff = await currentStaff();
    if (!staff) return json({ error: "Sign in" }, 401);
    const { status } = (await req.json()) as { status: string };
    if (!["seated", "no_show", "cancelled"].includes(status)) return json({ error: "Bad status" }, 400);
    await setBookingStatus(staff, (await ctx.params).id, status as "seated");
    return json({ ok: true });
  } catch (e) {
    return errorJson(e);
  }
}
