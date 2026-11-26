import { setGuestSocial } from "@round/db/groups";
import { currentGuest, errorJson, json } from "@/lib/server";

/** Leaderboard opt-in and display name, and the Revolut handle friends can pay. */
export async function POST(req: Request) {
  try {
    const guest = await currentGuest();
    if (!guest) return json({ error: "Sign in first" }, 401);
    const b = (await req.json()) as { leaderboardOptIn?: boolean | string; leaderboardName?: string; revolutHandle?: string };
    await setGuestSocial(guest, {
      ...(b.leaderboardOptIn !== undefined ? { leaderboardOptIn: b.leaderboardOptIn === true || b.leaderboardOptIn === "on" } : {}),
      ...(b.leaderboardName !== undefined ? { leaderboardName: b.leaderboardName } : {}),
      ...(b.revolutHandle !== undefined ? { revolutHandle: b.revolutHandle } : {}),
    });
    return json({ ok: true, message: "Saved" });
  } catch (e) {
    return errorJson(e);
  }
}
