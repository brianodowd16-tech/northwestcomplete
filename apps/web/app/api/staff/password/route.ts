import { changePassword } from "@round/db/admin";
import { venueById } from "@round/db/services";
import { allow } from "@/lib/ratelimit";
import { currentStaff, errorJson, json } from "@/lib/server";

export async function POST(req: Request) {
  try {
    const staff = await currentStaff();
    if (!staff) return json({ error: "Sign in first" }, 401);
    if (!await allow(`pw:${staff.id}`, 10, 15 * 60_000)) return json({ error: "Too many attempts. Try again later." }, 429);
    const { current, next } = (await req.json()) as { current?: string; next?: string };
    await changePassword(staff, current ?? "", next ?? "");
    return json({ slug: (await venueById(staff.venueId)).slug });
  } catch (e) {
    return errorJson(e);
  }
}
