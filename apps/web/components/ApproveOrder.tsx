"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { eur } from "./format";
import { toast } from "./Toasts";

/** An order the guest's AI assistant prepared: nothing happens until they approve it here. */
export function ApproveOrder({ slug, orderId, amountCents }: { slug: string; orderId: string; amountCents: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function approve() {
    setBusy(true);
    try {
      const res = await fetch(`/api/v/${slug}/orders/${orderId}/approve`, { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Couldn't approve");
      const c = d.checkout as { provider: string; redirect: { action: string; fields: [string, string][] } | null } | null;
      if (c?.redirect) {
        const form = document.createElement("form");
        form.method = "POST";
        form.action = c.redirect.action;
        for (const [name, value] of c.redirect.fields) {
          const i = document.createElement("input");
          i.type = "hidden";
          i.name = name;
          i.value = value;
          form.appendChild(i);
        }
        document.body.appendChild(form);
        form.submit();
        return;
      }
      if (c?.provider === "mock") {
        const pay = await fetch("/api/dev/mock-pay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, orderId }) });
        if (!pay.ok) throw new Error("Payment failed");
      }
      toast("Approved. Sending it to the bar now.", { kind: "ok" });
      router.refresh();
    } catch (e) {
      toast((e as Error).message, { kind: "err" });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="card rise" style={{ borderColor: "var(--vacc)" }}>
      <b>Your AI assistant prepared this order</b>
      <span className="muted small">Nothing has been charged or sent to the bar. Check it, then approve to pay {amountCents ? eur(amountCents) : "with your credit"}.</span>
      <button className="btn block" onClick={approve} disabled={busy}>
        {busy ? "Approving…" : amountCents ? `Approve and pay ${eur(amountCents)}` : "Approve order"}
      </button>
    </div>
  );
}
