import { COUNT_UNIT, formatEur, parseCountQty, parseEuro, parseTillCsv, type StockUnit } from "@round/core";
import * as inv from "@round/db/inventory";
import { mailConfigured, sendEmail } from "@/lib/mail";
import { managerFor } from "@/lib/office";
import { errorJson, json } from "@/lib/server";

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
/** Fields named "<prefix><id>" with a value, e.g. "packs:abc" = "2". */
const byPrefix = (b: Record<string, unknown>, prefix: string) =>
  Object.entries(b)
    .filter(([k, v]) => k.startsWith(prefix) && str(v) !== "")
    .map(([k, v]) => ({ id: k.slice(prefix.length), value: str(v) }));

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const m = await managerFor((await ctx.params).slug);
    if (m instanceof Response) return m;
    const { venue, staff } = m;
    const b = (await req.json()) as Record<string, unknown>;
    const units = new Map((await inv.stockLevels(venue)).items.map((i) => [i.id, i.unit as StockUnit]));
    switch (b.action) {
      case "supplier":
        await inv.saveSupplier(venue, { id: str(b.id) || undefined, name: str(b.name), email: str(b.email), phone: str(b.phone) });
        return json({ message: "Supplier saved" });
      case "item": {
        const unit = str(b.unit) as StockUnit;
        if (!COUNT_UNIT[unit]) return json({ error: "Choose a unit" }, 400);
        await inv.saveStockItem(venue, {
          id: str(b.id) || undefined,
          name: str(b.name),
          category: str(b.category),
          unit,
          supplierId: str(b.supplierId) || null,
          packSize: parseCountQty(str(b.packSize), unit),
          packName: str(b.packName),
          packCostCents: parseEuro(str(b.packCost)),
          parLevel: str(b.par) ? parseCountQty(str(b.par), unit) : 0,
          active: b.active === undefined ? true : b.active === "on",
        });
        return json({ message: "Stock item saved" });
      }
      case "recipe":
        await inv.setRecipe(
          venue,
          str(b.menuItemId),
          byPrefix(b, "qty:").map((l) => ({ stockItemId: l.id, qty: Number(l.value) })),
        );
        return json({ message: "Recipe saved" });
      case "delivery": {
        const lines = byPrefix(b, "packs:").map((l) => ({ stockItemId: l.id, packs: Number(l.value), packCostCents: parseEuro(str(b[`price:${l.id}`])) }));
        const d = await inv.recordDelivery(venue, staff, { supplierId: str(b.supplierId) || null, reference: str(b.reference), lines });
        return json({ message: `Delivery recorded: ${formatEur(d.totalCents)}` });
      }
      case "waste": {
        const id = str(b.stockItemId);
        await inv.recordWaste(venue, staff, { stockItemId: id, qty: parseCountQty(str(b.amount), units.get(id) ?? "each"), reason: str(b.reason) });
        return json({ message: "Waste logged" });
      }
      case "count": {
        const c = await inv.recordCount(
          venue,
          staff,
          byPrefix(b, "count:").map((l) => ({ stockItemId: l.id, counted: parseCountQty(l.value, units.get(l.id) ?? "each") })),
        );
        return json({ message: `Count saved. Difference at cost: ${formatEur(c.varianceCents)}` });
      }
      case "autoSoldOut":
        await inv.setAutoSoldOut(venue, b.on === "on");
        return json({ message: b.on === "on" ? "Items will go sold out when stock runs out" : "Automatic sold-out is off" });
      case "till": {
        const r = await inv.importTillSales(venue, staff, str(b.date), parseTillCsv(str(b.csv)));
        return json({
          message: `${r.matched} items imported${r.replaced ? " (replaced that day's earlier import)" : ""}${r.unmatched.length ? `. Not on your menu: ${r.unmatched.slice(0, 5).join(", ")}${r.unmatched.length > 5 ? "…" : ""}` : ""}`,
        });
      }
      case "po": {
        await inv.createPurchaseOrder(
          venue,
          str(b.supplierId),
          byPrefix(b, "packs:").map((l) => ({ stockItemId: l.id, packs: Number(l.value) })),
        );
        return json({ message: "Order created. Check it, then send it." });
      }
      case "poSend": {
        const po = (await inv.purchaseOrders(venue)).find((p) => p.id === str(b.poId));
        if (!po) return json({ error: "Order not found" }, 404);
        if (po.supplier.email && mailConfigured()) {
          const text = [
            `Order from ${venue.name}${venue.town ? `, ${venue.town}` : ""}`,
            "",
            ...po.lines.map((l) => `${l.packs} × ${l.packName} ${l.name}`),
            "",
            `Expected total (ex VAT): ${formatEur(po.totalCents)}`,
            `Reference: PO ${po.id.slice(0, 8).toUpperCase()}`,
            "",
            `Please reply to ${staff.email} to confirm delivery.`,
          ].join("\n");
          await sendEmail(po.supplier.email, `Order from ${venue.name} (PO ${po.id.slice(0, 8).toUpperCase()})`, text, staff.email);
          await inv.setPurchaseOrderStatus(venue, po.id, "sent");
          return json({ message: `Emailed to ${po.supplier.email}` });
        }
        await inv.setPurchaseOrderStatus(venue, po.id, "sent");
        return json({ message: po.supplier.email ? "Marked as sent (email isn't set up on the server, so send it yourself)" : "Marked as sent. Add the supplier's email to send orders automatically." });
      }
      case "poReceive":
        await inv.receivePurchaseOrder(venue, staff, str(b.poId));
        return json({ message: "Delivery recorded from the order" });
      case "poCancel":
        await inv.setPurchaseOrderStatus(venue, str(b.poId), "cancelled");
        return json({ message: "Order cancelled" });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return errorJson(e);
  }
}
