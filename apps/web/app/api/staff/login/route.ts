import { checkPassword } from "@round/core";
import { staffByEmail, venueById } from "@round/db/services";
import { errorJson, json, startStaffSession } from "@/lib/server";

export async function POST(req: Request) {
  try {
    const { email, password } = (await req.json()) as { email?: string; password?: string };
    const staff = await staffByEmail(email ?? "");
    if (!staff || !checkPassword(password ?? "", staff.passwordHash)) return json({ error: "Wrong email or password" }, 401);
    await startStaffSession(staff.id);
    return json({ slug: (await venueById(staff.venueId)).slug });
  } catch (e) {
    return errorJson(e);
  }
}
