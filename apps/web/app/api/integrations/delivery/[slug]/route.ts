import { verifySignature } from "@round/core";
import { ringUpDelivery } from "@round/db/growth";
import { venueBySlug } from "@round/db/services";
import { integrationSecret } from "@/lib/partners";
import { errorJson, json } from "@/lib/server";

/**
 * Orders from delivery platforms (Deliveroo, Just Eat, Uber Eats) through an aggregator such as
 * Deliverect, or a platform's own API. Body: { platform, orderId, customerName?, items: [{ plu?, name?, qty }] },
 * signed with the venue's secret: header X-Complete-Signature: sha256=<hex HMAC of the raw body>.
 */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const venue = await venueBySlug((await ctx.params).slug);
    const raw = await req.text();
    const cfg = await integrationSecret(venue, "delivery");
    if (!cfg || !verifySignature(raw, cfg.secret, req.headers.get("x-complete-signature"))) return json({ error: "Bad signature" }, 401);
    if (venue.status !== "live") return json({ error: "Venue isn't live" }, 409);
    const b = JSON.parse(raw) as { platform: string; orderId: string; customerName?: string; items: { plu?: string; name?: string; qty: number }[] };
    const r = await ringUpDelivery(venue, { platform: b.platform, externalId: String(b.orderId), customerName: b.customerName, items: Array.isArray(b.items) ? b.items : [] });
    if (!r.order) return json({ error: "No items" }, 400);
    return json({ ok: true, number: r.order.number, repeat: r.repeat });
  } catch (e) {
    return errorJson(e);
  }
}
