import { verifyWooSignature, type WooOrder } from "@round/core";
import { connection, importWooOrder } from "@round/db/connect";
import { venueBySlug } from "@round/db/services";
import { errorJson, json, secretsKey } from "@/lib/server";

/**
 * WooCommerce order webhooks (topics order.created / order.updated) for one venue's shop.
 * Verified with the webhook secret the manager saved (X-WC-Webhook-Signature); idempotent by order id.
 */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const venue = await venueBySlug((await ctx.params).slug);
    const raw = await req.text();
    const c = await connection(venue, "woocommerce", secretsKey());
    if (!c?.secrets.webhookSecret) return json({ error: "Not set up" }, 404);
    // WooCommerce pings a new webhook with a form body (webhook_id=…) before signing anything.
    if (/^webhook_id=\d+$/.test(raw.trim())) return json({ ok: true });
    if (!verifyWooSignature(raw, c.secrets.webhookSecret, req.headers.get("x-wc-webhook-signature"))) return json({ error: "Bad signature" }, 401);
    if (venue.status !== "live") return json({ ok: true, result: "venue_in_test_mode" });
    const result = await importWooOrder(venue, JSON.parse(raw) as WooOrder);
    return json({ ok: true, result });
  } catch (e) {
    return errorJson(e);
  }
}
