import { setSoldOut, venueById } from "@round/db/services";
import { currentStaff, errorJson, json } from "@/lib/server";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const staff = await currentStaff();
    if (!staff) return json({ error: "Sign in" }, 401);
    const { soldOut } = (await req.json()) as { soldOut?: boolean };
    await setSoldOut(await venueById(staff.venueId), (await ctx.params).id, soldOut === true);
    return json({ ok: true });
  } catch (e) {
    return errorJson(e);
  }
}
