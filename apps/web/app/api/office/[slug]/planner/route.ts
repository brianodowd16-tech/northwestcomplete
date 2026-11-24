import { parseEuro } from "@round/core";
import { applyPrice, setHourlyRate } from "@round/db/growth";
import { managerFor } from "@/lib/office";
import { errorJson, json } from "@/lib/server";

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const m = await managerFor((await ctx.params).slug);
    if (m instanceof Response) return m;
    const b = (await req.json()) as Record<string, string>;
    if (b.action === "price") {
      await applyPrice(m.venue, b.menuItemId, Number(b.priceCents));
      return json({ message: "Price updated on the menu" });
    }
    if (b.action === "rate") {
      await setHourlyRate(m.venue, b.staffId, parseEuro(b.rate));
      return json({ message: "Hourly rate saved" });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return errorJson(e);
  }
}
