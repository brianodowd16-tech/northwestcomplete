import { saveIntegration } from "@round/db/integrations";
import { setBookingCapacity, setBrandSharing } from "@round/db/growth";
import { randomBytes } from "node:crypto";
import { managerFor } from "@/lib/office";
import { errorJson, json, secretsKey } from "@/lib/server";

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
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return errorJson(e);
  }
}
