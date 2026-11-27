import { declineSong, playedSong, queueSong, songQueue } from "@round/db/songs";
import { venueById } from "@round/db/services";
import { currentStaff, errorJson, json, providerFor } from "@/lib/server";

export async function GET() {
  const staff = await currentStaff();
  if (!staff) return json({ error: "Sign in" }, 401);
  return json(await songQueue(staff));
}

/** { id, action: "queue" | "played" | "decline" }. Declining a paid request refunds it first. */
export async function POST(req: Request) {
  try {
    const staff = await currentStaff();
    if (!staff) return json({ error: "Sign in" }, 401);
    const b = (await req.json()) as { id?: string; action?: string; status?: string };
    const id = String(b.id ?? "");
    const action = b.action ?? (b.status === "declined" ? "decline" : "played");
    if (action === "queue") {
      await queueSong(staff, id);
      return json({ ok: true, message: "Queued" });
    }
    if (action === "decline") {
      const r = await declineSong(staff, id, await providerFor(await venueById(staff.venueId)));
      return json({ ok: true, message: r === "refunded" ? "Declined and refunded" : "Declined" });
    }
    await playedSong(staff, id);
    return json({ ok: true });
  } catch (e) {
    return errorJson(e);
  }
}
