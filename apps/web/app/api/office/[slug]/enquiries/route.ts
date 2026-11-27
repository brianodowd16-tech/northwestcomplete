import { setLeadStatus } from "@round/db/sponsors";
import { managerFor } from "@/lib/office";
import { errorJson, json } from "@/lib/server";

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const m = await managerFor((await ctx.params).slug);
    if (m instanceof Response) return m;
    const b = (await req.json()) as { id?: string; status?: string };
    const status = (["new", "contacted", "booked", "closed"] as const).find((x) => x === b.status);
    if (!status) return json({ error: "Bad request" }, 400);
    await setLeadStatus(m.venue, String(b.id ?? ""), status);
    return json({ message: "Updated" });
  } catch (e) {
    return errorJson(e);
  }
}
