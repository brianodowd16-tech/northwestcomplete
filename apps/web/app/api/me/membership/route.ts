import type { MockProvider } from "@round/core";
import { buyPoints, buyTier, handleCompleteWebhook, paymentForCustomer, walletSummary } from "@round/db/membership";
import { completeProvider } from "@/lib/membership";
import { appUrl, currentGuest, errorJson, json } from "@/lib/server";

export async function GET() {
  const guest = await currentGuest();
  if (!guest) return json({ error: "Sign in" }, 401);
  const s = await walletSummary(guest.id);
  return json({ tier: s.tier?.tier ?? null, endsAt: s.tier?.endsAt ?? null, balances: s.balances });
}

/** { action: "tier", tier, period } | { action: "points", cents } | { action: "test-pay", paymentId } (test mode only). */
export async function POST(req: Request) {
  try {
    const guest = await currentGuest();
    if (!guest) return json({ error: "Sign in" }, 401);
    const provider = completeProvider();
    if (!provider) return json({ error: "Memberships open soon" }, 503);
    const b = (await req.json()) as Record<string, string | number>;
    const key = String(b.idempotencyKey ?? "");
    const mode = process.env.REVOLUT_MODE === "prod" ? "prod" : "sandbox";
    if (b.action === "tier") {
      const r = await buyTier(guest, b.tier === "platinum" ? "platinum" : "gold", b.period === "annual" ? "annual" : "monthly", key, provider, appUrl());
      return json({ paymentId: r.payment.id, checkout: { ...r.checkout, mode } });
    }
    if (b.action === "points") {
      const r = await buyPoints(guest, Number(b.cents), key, provider, appUrl());
      return json({ paymentId: r.payment.id, checkout: { ...r.checkout, mode } });
    }
    if (b.action === "test-pay") {
      if (provider.name !== "mock") return json({ error: "Not in test mode" }, 404);
      const p = await paymentForCustomer(guest.id, String(b.paymentId ?? ""));
      if (!p?.providerOrderId) return json({ error: "Not found" }, 404);
      const { rawBody, headers } = (provider as MockProvider).simulatePayment(p.providerOrderId);
      await handleCompleteWebhook(provider, rawBody, headers);
      return json({ ok: true });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return errorJson(e);
  }
}
