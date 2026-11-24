import { deleteGuest } from "@round/db/privacy";
import { currentGuest, endSessions, json } from "@/lib/server";

/** GDPR: deletes the guest's account (personal details wiped; sales records kept anonymously for VAT). */
export async function POST(req: Request) {
  const guest = await currentGuest();
  if (!guest) return json({ error: "Sign in first" }, 401);
  const { confirm } = (await req.json().catch(() => ({}))) as { confirm?: string };
  if (confirm !== "DELETE") return json({ error: "Type DELETE to confirm" }, 400);
  await deleteGuest(guest.id);
  await endSessions();
  return json({ ok: true });
}
