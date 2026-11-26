import { createGroup, myGroups } from "@round/db/groups";
import { currentGuest, errorJson, json } from "@/lib/server";

export async function GET() {
  const guest = await currentGuest();
  if (!guest) return json({ error: "Sign in first" }, 401);
  return json({ groups: await myGroups(guest.id) });
}

export async function POST(req: Request) {
  try {
    const guest = await currentGuest();
    if (!guest) return json({ error: "Sign in first" }, 401);
    const g = await createGroup(guest, String(((await req.json()) as { name?: string }).name ?? ""));
    return json({ id: g.id });
  } catch (e) {
    return errorJson(e);
  }
}
