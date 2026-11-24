import { exportGuestData } from "@round/db/privacy";
import { currentGuest, json } from "@/lib/server";

/** GDPR: everything Complete holds about the signed-in guest, as a JSON file. */
export async function GET() {
  const guest = await currentGuest();
  if (!guest) return json({ error: "Sign in first" }, 401);
  const data = await exportGuestData(guest.id);
  return new Response(JSON.stringify(data, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="complete-my-data.json"` } });
}
