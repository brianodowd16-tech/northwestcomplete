import { revalidateTag } from "next/cache";
import { CONTENT_TAG } from "@/lib/content";
import { PRODUCTS_TAG } from "@/lib/woo";
import { verifyWooWebhook } from "@/lib/webhook";

/**
 * Point WooCommerce webhooks (Product created / updated / deleted) here so
 * price and stock changes appear on the storefront within seconds.
 * `?scope=content` refreshes the showroom pages too.
 */
export async function POST(request: Request) {
  const body = await request.text();
  const secret = process.env.WC_WEBHOOK_SECRET ?? "";
  if (!verifyWooWebhook(body, request.headers.get("x-wc-webhook-signature"), secret)) {
    // WooCommerce's first "ping" when a webhook is saved is unsigned form data.
    if (body.startsWith("webhook_id=")) return new Response("pong");
    return new Response("invalid signature", { status: 401 });
  }
  revalidateTag(PRODUCTS_TAG, { expire: 0 });
  if (new URL(request.url).searchParams.get("scope") === "content") revalidateTag(CONTENT_TAG, { expire: 0 });
  return Response.json({ revalidated: true });
}
