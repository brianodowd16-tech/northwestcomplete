import { joinGroup } from "@round/db/groups";
import { allow } from "@/lib/ratelimit";
import { currentGuest, errorJson, json } from "@/lib/server";

export async function POST(req: Request) {
  try {
    const guest = await currentGuest();
    if (!guest) return json({ error: "Sign in first" }, 401);
    if (!(await allow(`join:${guest.id}`, 20, 60 * 60_000))) return json({ error: "Too many attempts. Try again later." }, 429);
    const g = await joinGroup(guest, String(((await req.json()) as { code?: string }).code ?? ""));
    return json({ id: g.id });
  } catch (e) {
    return errorJson(e);
  }
}
