import { parseEuro } from "@round/core";
import { recordCashUp } from "@round/db/till";
import { venueById } from "@round/db/services";
import { currentStaff, errorJson, json } from "@/lib/server";

export async function POST(req: Request) {
  try {
    const staff = await currentStaff();
    if (!staff) return json({ error: "Sign in" }, 401);
    const b = (await req.json()) as Record<string, string>;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date ?? "")) return json({ error: "Bad date" }, 400);
    const r = await recordCashUp(await venueById(staff.venueId), staff, b.date, { floatCents: parseEuro(b.float || "0"), countedCents: parseEuro(b.counted), note: b.note });
    return json({ message: r.varianceCents === 0 ? "Cash-up saved: spot on" : `Cash-up saved: ${r.varianceCents > 0 ? "over" : "short"} by €${(Math.abs(r.varianceCents) / 100).toFixed(2)}` });
  } catch (e) {
    return errorJson(e);
  }
}
