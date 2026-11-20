"use client";

import Link from "next/link";
import { useState } from "react";
import { formatPrice } from "@/lib/money";
import { useCart } from "./cart";

type Fulfilment = "collect" | "delivery";

function postToMyPos(url: string, fields: [string, string][]) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = url;
  form.acceptCharset = "UTF-8";
  for (const [name, value] of fields) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}

export function CheckoutForm({ sandbox }: { sandbox: boolean }) {
  const { lines, ready, subtotalCents } = useCart();
  const [fulfilment, setFulfilment] = useState<Fulfilment>("collect");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!ready) return <div className="panel" style={{ minHeight: 300 }} aria-busy="true" />;
  if (!lines.length) {
    return (
      <div className="empty">
        <p className="lead" style={{ margin: "0 auto 24px" }}>Your basket is empty.</p>
        <Link href="/shop" className="btn btn--primary">Browse special offers</Link>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const v = (k: string) => String(f.get(k) ?? "");
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: lines.map((l) => ({ id: l.id, qty: l.qty })),
          customer: {
            firstName: v("firstName"),
            lastName: v("lastName"),
            email: v("email"),
            phone: v("phone"),
            address1: v("address1"),
            city: v("city"),
            county: v("county"),
            eircode: v("eircode"),
          },
          fulfilment,
          notes: v("notes"),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
      postToMyPos(data.url, data.fields);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <form className="layout-2" onSubmit={onSubmit} noValidate={false}>
      <div>
        {error && <p className="alert alert--error" role="alert">{error}</p>}
        <fieldset className="panel" style={{ border: 0 }}>
          <legend className="sr-only">Your details</legend>
          <h2 style={{ fontSize: "1.3rem" }}>1. Your details</h2>
          <div className="row-2">
            <div className="field"><label htmlFor="firstName">First name</label><input id="firstName" name="firstName" autoComplete="given-name" required maxLength={60} /></div>
            <div className="field"><label htmlFor="lastName">Last name</label><input id="lastName" name="lastName" autoComplete="family-name" required maxLength={60} /></div>
          </div>
          <div className="row-2">
            <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" required maxLength={120} /></div>
            <div className="field"><label htmlFor="phone">Phone</label><input id="phone" name="phone" type="tel" autoComplete="tel" required minLength={6} maxLength={30} /></div>
          </div>
          <div className="field"><label htmlFor="address1">Address</label><input id="address1" name="address1" autoComplete="address-line1" required maxLength={120} /></div>
          <div className="row-2">
            <div className="field"><label htmlFor="city">Town</label><input id="city" name="city" autoComplete="address-level2" required maxLength={60} /></div>
            <div className="field"><label htmlFor="county">County</label><input id="county" name="county" autoComplete="address-level1" maxLength={60} /></div>
          </div>
          <div className="field" style={{ maxWidth: 220 }}><label htmlFor="eircode">Eircode</label><input id="eircode" name="eircode" autoComplete="postal-code" maxLength={10} /></div>
        </fieldset>

        <fieldset className="panel" style={{ border: 0 }}>
          <legend className="sr-only">Collection or delivery</legend>
          <h2 style={{ fontSize: "1.3rem" }}>2. Collection or delivery</h2>
          <div className="choices">
            <label className="choice">
              <input type="radio" name="fulfilment" value="collect" checked={fulfilment === "collect"} onChange={() => setFulfilment("collect")} />
              <span><strong>Click &amp; Collect, free</strong><small>Collect from our Station Road showroom, Carrick-on-Shannon. We'll call when it's ready.</small></span>
            </label>
            <label className="choice">
              <input type="radio" name="fulfilment" value="delivery" checked={fulfilment === "delivery"} onChange={() => setFulfilment("delivery")} />
              <span><strong>Delivery</strong><small>We'll call you to arrange a delivery date. Any delivery charge is agreed with you before we dispatch.</small></span>
            </label>
          </div>
          <div className="field" style={{ marginTop: 16 }}><label htmlFor="notes">Order notes (optional)</label><textarea id="notes" name="notes" rows={3} maxLength={500} placeholder="Access details, preferred call times…" /></div>
        </fieldset>
      </div>

      <aside className="panel summary" aria-label="Order summary">
        <h2 style={{ fontSize: "1.3rem" }}>3. Pay securely</h2>
        {lines.map((l) => (
          <div key={l.id} className="totals" style={{ margin: "0 0 8px" }}>
            <div><span>{l.qty} × {l.name}</span><span>{formatPrice(l.priceCents * l.qty)}</span></div>
          </div>
        ))}
        <div className="totals">
          <div><span>{fulfilment === "collect" ? "Click & Collect" : "Delivery"}</span><span>{fulfilment === "collect" ? "Free" : "Arranged by phone"}</span></div>
          <div className="grand"><span>Total</span><span>{formatPrice(subtotalCents)}</span></div>
        </div>
        <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
          {busy ? "Taking you to secure payment…" : `Pay ${formatPrice(subtotalCents)} by card`}
        </button>
        <p className="secure">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></svg>
          You'll pay on myPOS's secure payment page. We never see your card details.
        </p>
        <p className="muted" style={{ fontSize: ".82rem", textAlign: "center" }}>
          By paying you agree to our <Link href="/terms" className="link">terms, delivery &amp; returns</Link>.
        </p>
        {sandbox && <p className="sandbox-note">Test mode: payments go to the myPOS sandbox. Use test card 4006 0900 0000 0007, expiry 12/30, any CVC. No money is taken.</p>}
      </aside>
    </form>
  );
}
