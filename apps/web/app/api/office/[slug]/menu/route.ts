import { parseEuro } from "@round/core";
import { deleteCategory, saveCategory, saveItem } from "@round/db/admin";
import { managerFor } from "@/lib/office";
import { errorJson, json } from "@/lib/server";

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const m = await managerFor((await ctx.params).slug);
    if (m instanceof Response) return m;
    const b = (await req.json()) as Record<string, unknown>;
    if (b.action === "category") return json({ category: await saveCategory(m.venue, { id: b.id ? String(b.id) : undefined, name: String(b.name ?? "") }) });
    if (b.action === "deleteCategory") return (await deleteCategory(m.venue, String(b.id))), json({ ok: true });
    if (b.action === "item") {
      const item = await saveItem(m.venue, {
        id: b.id ? String(b.id) : undefined,
        categoryId: String(b.categoryId ?? ""),
        name: String(b.name ?? ""),
        description: String(b.description ?? ""),
        priceCents: parseEuro(String(b.price ?? "")),
        vatRate: Number(b.vatRate),
        station: String(b.station ?? ""),
        containsAlcohol: b.containsAlcohol === true,
        availableForCollect: b.availableForCollect === true,
        active: b.active !== false,
        allergens: Array.isArray(b.allergens) ? (b.allergens as unknown[]).map(String) : [],
      });
      return json({ item });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return errorJson(e);
  }
}
