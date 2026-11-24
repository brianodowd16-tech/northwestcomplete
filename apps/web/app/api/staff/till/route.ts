import { refundTillSale, ringUpSale } from "@round/db/till";
import { venueById } from "@round/db/services";
import { currentStaff, errorJson, json } from "@/lib/server";

export async function POST(req: Request) {
  try {
    const staff = await currentStaff();
    if (!staff) return json({ error: "Sign in" }, 401);
    const venue = await venueById(staff.venueId);
    const b = (await req.json()) as Record<string, unknown>;
    if (b.action === "refund") {
      await refundTillSale(venue, staff, String(b.orderId ?? ""));
      return json({ ok: true });
    }
    const r = await ringUpSale(venue, staff, {
      key: String(b.key ?? ""),
      lines: Array.isArray(b.lines) ? (b.lines as { menuItemId: string; qty: number }[]).map((l) => ({ menuItemId: String(l.menuItemId), qty: Number(l.qty) })) : [],
      method: b.method === "card" ? "card" : "cash",
      tableNumber: b.tableNumber ? Number(b.tableNumber) : null,
      tenderedCents: b.tenderedCents != null ? Number(b.tenderedCents) : null,
      cardRef: b.cardRef ? String(b.cardRef) : null,
    });
    return json({ number: r.order.number, totalCents: r.order.amountPaidCents, changeCents: r.changeCents, repeat: r.repeat });
  } catch (e) {
    return errorJson(e);
  }
}
