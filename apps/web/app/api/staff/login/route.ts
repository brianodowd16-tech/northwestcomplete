import { checkPassword } from "@round/core";
import { staffByEmail, venueById } from "@round/db/services";
import { allow, clientIp } from "@/lib/ratelimit";
import { errorJson, json, startStaffSession } from "@/lib/server";

export async function POST(req: Request) {
  try {
    if (!allow(`login:${await clientIp()}`, 20, 15 * 60_000)) return json({ error: "Too many attempts. Try again in a few minutes." }, 429);
    const { email, password } = (await req.json()) as { email?: string; password?: string };
    const staff = await staffByEmail(email ?? "");
    if (!staff || !checkPassword(password ?? "", staff.passwordHash)) return json({ error: "Wrong email or password" }, 401);
    await startStaffSession(staff.id);
    return json({ slug: (await venueById(staff.venueId)).slug, mustChangePassword: staff.mustChangePassword });
  } catch (e) {
    return errorJson(e);
  }
}
