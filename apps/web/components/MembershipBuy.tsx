"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { submitHostedCheckout, type CheckoutInfo } from "./Ordering";
import { toast } from "./Toasts";

/** One button that buys a membership or points through Complete's own checkout. */
export function MembershipBuy({ body, label, ghost }: { body: Record<string, string | number>; label: string; ghost?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    try {
      const res = await fetch("/api/me/membership", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, idempotencyKey: crypto.randomUUID() }) });
      const d = (await res.json()) as { error?: string; paymentId: string; checkout: CheckoutInfo };
      if (!res.ok) throw new Error(d.error ?? "Something went wrong");
      const c = d.checkout;
      if (c.redirect) return submitHostedCheckout(c.redirect);
      if (c.provider === "revolut") {
        const { default: RevolutCheckout } = await import("@revolut/checkout");
        (await RevolutCheckout(c.token!, c.mode)).payWithPopup({ onSuccess: () => { toast("Paid. Thank you!", { kind: "ok" }); setTimeout(() => router.refresh(), 1500); }, onError: (err: unknown) => toast(String(err), { kind: "err" }) });
        return;
      }
      const r = await fetch("/api/me/membership", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "test-pay", paymentId: d.paymentId }) });
      if (!r.ok) throw new Error("Test payment failed");
      toast("Paid (test payment). Thank you!", { kind: "ok" });
      router.refresh();
    } catch (e) {
      toast((e as Error).message, { kind: "err" });
    } finally {
      setBusy(false);
    }
  }
  return <button className={`btn sm ${ghost ? "ghost" : ""}`} disabled={busy} onClick={go}>{busy ? "…" : label}</button>;
}
