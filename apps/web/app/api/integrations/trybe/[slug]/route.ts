import { trybeBooking, verifyTrybeSignature, type TrybeOrder } from "@round/core";
import { connection, savePartnerBooking } from "@round/db/connect";
import { venueBySlug } from "@round/db/services";
import { errorJson, json, secretsKey } from "@/lib/server";

/**
 * Trybe webhooks (basket.submitted, basket.settled, basket.cancelled) for one venue's site: spa and
 * activity bookings shown on the staff Bookings screen and in the guest's own hub. Signed (header
 * `signature`, hex HMAC of the raw body); delivered at least once, so saved by Trybe's order id.
 */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const venue = await venueBySlug((await ctx.params).slug);
    const raw = await req.text();
    const c = await connection<{ siteId: string }>(venue, "trybe", secretsKey());
    if (!c?.secrets.webhookSecret) return json({ error: "Not set up" }, 404);
    if (!verifyTrybeSignature(raw, c.secrets.webhookSecret, req.headers.get("signature"))) return json({ error: "Bad signature" }, 401);
    const e = JSON.parse(raw) as { event?: string; site_id?: string; data?: TrybeOrder };
    if (c.config.siteId && e.site_id && e.site_id !== c.config.siteId) return json({ error: "Another site" }, 409);
    if (!e.data?.id || !String(e.event ?? "").startsWith("basket.")) return json({ ok: true, ignored: e.event ?? null });
    if (e.event === "basket.no_showed") return json({ ok: true });
    await savePartnerBooking(venue, trybeBooking(e.data, e.event === "basket.cancelled"));
    return json({ ok: true });
  } catch (e) {
    return errorJson(e);
  }
}
