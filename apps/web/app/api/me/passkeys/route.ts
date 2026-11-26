import { passkeysFor, removePasskey } from "@round/db/passkeys";
import { currentGuest, errorJson, json } from "@/lib/server";

export async function GET() {
  const guest = await currentGuest();
  if (!guest) return json({ error: "Sign in first" }, 401);
  return json({ passkeys: (await passkeysFor("guest", guest.id)).map((k) => ({ id: k.id, name: k.name, createdAt: k.createdAt, lastUsedAt: k.lastUsedAt })) });
}

export async function DELETE(req: Request) {
  try {
    const guest = await currentGuest();
    if (!guest) return json({ error: "Sign in first" }, 401);
    await removePasskey("guest", guest.id, new URL(req.url).searchParams.get("id") ?? "");
    return json({ ok: true });
  } catch (e) {
    return errorJson(e);
  }
}
