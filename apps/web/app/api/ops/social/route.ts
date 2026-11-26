import { updateVenuePost } from "@round/db/social";
import { errorJson, json } from "@/lib/server";

/** Approve or skip a network post (behind the ops login in middleware.ts). */
export async function POST(req: Request) {
  try {
    const b = (await req.json()) as { id?: string; status?: string };
    await updateVenuePost(null, String(b.id ?? ""), { status: b.status === "skipped" ? "skipped" : "approved" });
    return json({ ok: true });
  } catch (e) {
    return errorJson(e);
  }
}
