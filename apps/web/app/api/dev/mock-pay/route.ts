import type { MockProvider } from "@round/core";
import { handleWebhook, orderForCustomer, venueBySlug } from "@round/db/services";
import { currentGuest, errorJson, json, paymentProvider } from "@/lib/server";

// Mock checkout: plays the part of the Revolut widget + webhook when no Revolut keys are set.
export async function POST(req: Request) {
  try {
    const provider = paymentProvider();
    // Compare by name: the provider is cached on globalThis and may come from another bundle's copy of the class.
    if (provider.name !== "mock") return json({ error: "Mock payments are off" }, 404);
    const guest = await currentGuest();
    if (!guest) return json({ error: "Sign in first" }, 401);
    const { slug, orderId } = (await req.json()) as { slug: string; orderId: string };
    const venue = await venueBySlug(slug);
    const { order } = await orderForCustomer(venue, orderId, guest.id);
    if (!order.providerOrderId) return json({ error: "Nothing to pay" }, 400);
    const { rawBody, headers } = (provider as MockProvider).simulatePayment(order.providerOrderId);
    const r = await handleWebhook(provider, rawBody, headers);
    return json({ ok: r.status === 200 });
  } catch (e) {
    return errorJson(e);
  }
}
