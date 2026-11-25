import { localDate } from "@round/core";
import { saveIntegration, savePayrollSync, saveSageMapping, syncSageDay } from "@round/db/integrations";
import { setBookingCapacity, setBrandSharing } from "@round/db/growth";
import { randomBytes } from "node:crypto";
import { managerFor } from "@/lib/office";
import { sendPayroll } from "@/lib/payrollsync";
import { errorJson, json, sageApp, secretsKey } from "@/lib/server";

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const m = await managerFor((await ctx.params).slug);
    if (m instanceof Response) return m;
    const b = (await req.json()) as Record<string, string>;
    const key = secretsKey();
    switch (b.action) {
      case "bookings":
        await setBookingCapacity(m.venue, Number(b.seats || 0));
        return json({ message: Number(b.seats) > 0 ? "Bookings are on" : "Bookings are off" });
      case "brands":
        await setBrandSharing(m.venue, b.on === "on");
        return json({ message: b.on === "on" ? "Sharing anonymised sales with drinks brands" : "Sharing is off" });
      case "delivery": {
        if (!key) return json({ error: "SECRETS_KEY isn't set on the server" }, 500);
        const secret = randomBytes(24).toString("base64url");
        await saveIntegration(m.venue, "delivery", { createdAt: new Date().toISOString() }, secret, key);
        return json({ message: "New delivery secret created. Copy it now", secret });
      }
      case "pms": {
        if (!key) return json({ error: "SECRETS_KEY isn't set on the server" }, 500);
        const url = String(b.url ?? "").trim();
        if (url && !/^https:\/\/[^\s]+$/.test(url)) return json({ error: "Enter an https:// address" }, 400);
        const secret = randomBytes(24).toString("base64url");
        await saveIntegration(m.venue, "pms", { url }, secret, key);
        return json({ message: url ? "Room charges will be posted to your hotel system" : "Room charges are recorded for reception to post", secret });
      }
      case "sage-mapping":
        await saveSageMapping(m.venue, b);
        return json({ message: "Sage mapping saved" });
      case "sage-sync": {
        const app = sageApp();
        if (!app || !key) return json({ error: "Sage isn't configured on the server" }, 400);
        const day = /^\d{4}-\d{2}-\d{2}$/.test(String(b.date ?? "")) ? String(b.date) : localDate(new Date(Date.now() - 86_400_000), m.venue.timezone);
        const result = await syncSageDay(m.venue, day, app, key);
        const words: Record<string, string> = { done: `${day} posted to Sage`, nothing: `No app sales on ${day}`, already: `${day} is already in Sage`, not_connected: "Connect Sage first", not_mapped: "Finish the Sage mapping first", error: `Sage didn't accept ${day}: see the history below` };
        return json(result === "error" || result.startsWith("not_") ? { error: words[result] } : { message: words[result] }, result === "error" || result.startsWith("not_") ? 400 : 200);
      }
      case "payroll": {
        if (!key) return json({ error: "SECRETS_KEY isn't set on the server" }, 500);
        const push = b.mode === "webhook";
        const secret = push ? randomBytes(24).toString("base64url") : null;
        await savePayrollSync(m.venue, b as never, secret, key);
        return json({ message: push ? "Pay periods will be pushed to your payroll system" : `Each pay period will be emailed to ${String(b.email).trim()}`, ...(secret ? { secret } : {}) });
      }
      case "payroll-send": {
        const r = await sendPayroll(m.venue, { force: true });
        const msg: Record<string, string> = { sent: `Sent ${r.period?.start} to ${r.period?.end}`, nothing: "No clock-ins in the last pay period", not_set_up: "Set up payroll delivery first", already: "Already sent", error: `Not sent: ${r.error}` };
        return json(r.result === "error" || r.result === "not_set_up" ? { error: msg[r.result] } : { message: msg[r.result] }, r.result === "error" || r.result === "not_set_up" ? 400 : 200);
      }
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return errorJson(e);
  }
}
