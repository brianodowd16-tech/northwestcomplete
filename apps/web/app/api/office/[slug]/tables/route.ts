import { newTableCode, setTableCount } from "@round/db/admin";
import { managerFor } from "@/lib/office";
import { errorJson, json } from "@/lib/server";

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const m = await managerFor((await ctx.params).slug);
    if (m instanceof Response) return m;
    const b = (await req.json()) as { action?: string; count?: number; tableId?: string };
    if (b.action === "count") await setTableCount(m.venue, Number(b.count));
    else if (b.action === "newCode") await newTableCode(m.venue, String(b.tableId));
    else return json({ error: "Unknown action" }, 400);
    return json({ ok: true });
  } catch (e) {
    return errorJson(e);
  }
}
