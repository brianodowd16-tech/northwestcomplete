import { setPasswordWithToken } from "@round/db/platform";
import { allow, clientIp } from "@/lib/ratelimit";
import { errorJson, json } from "@/lib/server";

/** Sets a new password from an invite or reset link. */
export async function POST(req: Request) {
  try {
    const b = (await req.json()) as { token?: string; password?: string };
    if (!(await allow(`reset-ip:${await clientIp()}`, 20, 60 * 60_000))) return json({ error: "Too many attempts. Try again later." }, 429);
    const password = String(b.password ?? "");
    if (password.length < 10) return json({ error: "Use at least 10 characters" }, 400);
    const id = await setPasswordWithToken(String(b.token ?? ""), password);
    if (!id) return json({ error: "This link has expired or was already used. Ask for a new one." }, 400);
    return json({ message: "Password set. Sign in with your email and new password." });
  } catch (e) {
    return errorJson(e);
  }
}
