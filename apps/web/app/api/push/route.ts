import { deletePushSubscriptions, savePushSubscription } from "@round/db/push";
import { pushPublicKey } from "@/lib/push";
import { currentGuest, json } from "@/lib/server";

export async function GET() {
  return json({ publicKey: pushPublicKey() });
}

/** The guest turns on "tell me when it's ready" on this device. */
export async function POST(req: Request) {
  const guest = await currentGuest();
  if (!guest) return json({ error: "Sign in first" }, 401);
  try {
    await savePushSubscription(guest.id, (await req.json()) as { endpoint: string; keys: { p256dh: string; auth: string } });
    return json({ ok: true });
  } catch {
    return json({ error: "Couldn't turn on notifications" }, 400);
  }
}

export async function DELETE(req: Request) {
  const guest = await currentGuest();
  if (!guest) return json({ error: "Sign in first" }, 401);
  const { endpoint } = (await req.json()) as { endpoint?: string };
  if (endpoint) await deletePushSubscriptions([endpoint]);
  return json({ ok: true });
}
