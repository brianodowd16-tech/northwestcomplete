import { closeTab, refundTillSale, ringUpSale } from "@round/db/till";
import { venueById } from "@round/db/services";
import { after } from "next/server";
import { chargeRoomInMews } from "@/lib/connect";
import { postRoomCharge } from "@/lib/partners";
import { currentStaff, errorJson, json } from "@/lib/server";

export async function POST(req: Request) {
  try {
    const staff = await currentStaff();
    if (!staff) return json({ error: "Sign in" }, 401);
    const venue = await venueById(staff.venueId);
    const b = (await req.json()) as Record<string, unknown>;
    if (b.action === "closeTab") {
      const m = b.method === "card" ? "card" : b.method === "room" ? "room" : "cash";
      const r = await closeTab(venue, staff, String(b.tabId ?? ""), { method: m, tenderedCents: b.tenderedCents != null ? Number(b.tenderedCents) : null, roomNumber: b.roomNumber ? String(b.roomNumber) : null });
      return json(r);
    }
    if (b.action === "refund") {
      await refundTillSale(venue, staff, String(b.orderId ?? ""));
      return json({ ok: true });
    }
    const r = await ringUpSale(venue, staff, {
      key: String(b.key ?? ""),
      lines: Array.isArray(b.lines) ? (b.lines as { menuItemId: string; qty: number }[]).map((l) => ({ menuItemId: String(l.menuItemId), qty: Number(l.qty) })) : [],
      method: b.method === "card" ? "card" : b.method === "room" ? "room" : b.method === "tab" ? "tab" : "cash",
      discountCents: Number(b.discountCents ?? 0) || 0,
      discountReason: b.discountReason ? String(b.discountReason) : null,
      tabId: b.tabId ? String(b.tabId) : null,
      tabName: b.tabName ? String(b.tabName) : null,
      roomNumber: b.roomNumber ? String(b.roomNumber) : null,
      tableNumber: b.tableNumber ? Number(b.tableNumber) : null,
      tenderedCents: b.tenderedCents != null ? Number(b.tenderedCents) : null,
      cardRef: b.cardRef ? String(b.cardRef) : null,
    });
    if (r.order.provider === "room" && !r.repeat)
      after(() =>
        chargeRoomInMews(venue, r.order.id, r.order.roomNumber ?? "")
          .then((done) => done || postRoomCharge(venue, { orderNumber: r.order.number, roomNumber: r.order.roomNumber ?? "", amountCents: r.order.amountPaidCents, lines: [] }))
          .catch((e) => console.error("pms", e)),
      );
    return json({ number: r.order.number, totalCents: r.order.amountPaidCents, changeCents: r.changeCents, repeat: r.repeat });
  } catch (e) {
    return errorJson(e);
  }
}
