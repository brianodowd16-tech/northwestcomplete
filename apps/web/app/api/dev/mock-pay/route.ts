import { after } from "next/server";
import { sendReceipt } from "@/lib/receipt";
import type { MockProvider } from "@round/core";
import { handleWebhook, orderForCustomer, venueBySlug } from "@round/db/services";
import { currentGuest, errorJson, json, providerFor } from "@/lib/server";

// Test payments: plays the part of the provider's checkout + notification for venues on test mode.
export async function POST(req: Request) {
  try {
    const guest = await currentGuest();
    if (!guest) return json({ error: "Sign in first" }, 401);
    const { slug, orderId } = (await req.json()) as { slug: string; orderId: string };
    const venue = await venueBySlug(slug);
    const provider = await providerFor(venue);
    if (provider.name !== "mock") return json({ error: "Test payments are off for this venue" }, 404);
    const { order } = await orderForCustomer(venue, orderId, guest.id);
    if (!order.providerOrderId) return json({ error: "Nothing to pay" }, 400);
    const { rawBody, headers } = (provider as MockProvider).simulatePayment(order.providerOrderId);
    const r = await handleWebhook(provider, rawBody, headers, venue);
    if (r.completedOrderId) after(() => sendReceipt(r.completedOrderId!).catch((e) => console.error("receipt", e)));
    return json({ ok: r.status === 200 });
  } catch (e) {
    return errorJson(e);
  }
}
