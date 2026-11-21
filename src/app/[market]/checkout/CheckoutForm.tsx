"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { COUNTRIES, deliveryPrice, getCatalogItem, getCountry } from "@/lib/catalog";
import { useCart } from "@/lib/cart";
import { formatPrice } from "@/lib/site";

const input =
  "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-slate-900 focus:border-sea-500 focus:outline-none focus:ring-2 focus:ring-sea-200";

export function CheckoutForm({ market, countries }: { market: string; countries: string[] }) {
  const { lines, ready } = useCart();
  const [country, setCountry] = useState(countries[0]);
  const [method, setMethod] = useState<"delivery" | "collect">("delivery");
  const [status, setStatus] = useState<"idle" | "sending" | "error">("idle");
  const [error, setError] = useState("");

  const info = useMemo(() => {
    const resolved = lines.map((l) => ({ ...l, item: getCatalogItem(l.id) }));
    const goods = resolved.filter((l) => l.item?.shippable).reduce((n, l) => n + l.price * l.quantity, 0);
    const hasService = resolved.some((l) => l.item?.kind === "service");
    const subtotal = lines.reduce((n, l) => n + l.price * l.quantity, 0);
    const c = getCountry(country)!;
    const delivery = deliveryPrice(c, goods, method);
    return { goods, hasService, subtotal, delivery, total: subtotal + delivery };
  }, [lines, country, method]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("sending");
    setError("");
    const customer = Object.fromEntries(new FormData(e.currentTarget).entries());
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ market, lines: lines.map((l) => ({ id: l.id, quantity: l.quantity })), customer }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.url) throw new Error(json.error ?? "Checkout failed.");
      // Hand over to the myPOS hosted payment page with the signed fields.
      const form = document.createElement("form");
      form.method = "POST";
      form.action = json.url;
      for (const [name, value] of json.fields as [string, string][]) {
        const field = document.createElement("input");
        field.type = "hidden";
        field.name = name;
        field.value = value;
        form.appendChild(field);
      }
      document.body.appendChild(form);
      form.submit();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed.");
      setStatus("error");
    }
  }

  if (!ready) return <p className="mt-8 text-slate-500">Loading…</p>;
  if (lines.length === 0) {
    return (
      <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
        <p className="text-slate-600">Your basket is empty.</p>
        <Link href="/services" className="mt-4 inline-block rounded-md bg-sea-600 px-5 py-2.5 text-sm font-semibold text-white">
          Book a service
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
      <div className="grid gap-6 rounded-xl border border-slate-200 bg-white p-6">
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 font-display text-lg font-semibold text-navy-900">Your details</legend>
          <label className="text-sm font-medium text-slate-700">First name *<input name="firstName" required autoComplete="given-name" className={input} /></label>
          <label className="text-sm font-medium text-slate-700">Last name *<input name="lastName" required autoComplete="family-name" className={input} /></label>
          <label className="text-sm font-medium text-slate-700">Email *<input name="email" type="email" required autoComplete="email" className={input} /></label>
          <label className="text-sm font-medium text-slate-700">Phone / WhatsApp<input name="phone" type="tel" autoComplete="tel" className={input} /></label>
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">
            Country *
            <select name="country" value={country} onChange={(e) => setCountry(e.target.value)} className={input}>
              {COUNTRIES.filter((c) => countries.includes(c.code)).map((c) => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
          </label>
        </fieldset>

        {info.hasService && (
          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-2 font-display text-lg font-semibold text-navy-900">Your boat</legend>
            <label className="text-sm font-medium text-slate-700">Make, model &amp; length *<input name="boat" required className={input} /></label>
            <label className="text-sm font-medium text-slate-700">Where is it kept? *<input name="location" required placeholder={market === "mt" ? "e.g. Grand Harbour Marina" : "e.g. Killybegs"} className={input} /></label>
          </fieldset>
        )}

        {info.goods > 0 && (
          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-2 font-display text-lg font-semibold text-navy-900">Delivery</legend>
            <div className="grid gap-2 sm:col-span-2">
              {(["delivery", "collect"] as const).map((m) => (
                <label key={m} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm">
                  <input type="radio" name="delivery" value={m} checked={method === m} onChange={() => setMethod(m)} />
                  {m === "delivery" ? "Tracked delivery, 2–4 working days" : "Collect, or we bring it to your boat (free)"}
                </label>
              ))}
            </div>
            {method === "delivery" && (
              <>
                <label className="text-sm font-medium text-slate-700 sm:col-span-2">Address *<input name="address" required autoComplete="street-address" className={input} /></label>
                <label className="text-sm font-medium text-slate-700">Town / city *<input name="city" required autoComplete="address-level2" className={input} /></label>
                <label className="text-sm font-medium text-slate-700">Eircode / postcode<input name="zip" autoComplete="postal-code" className={input} /></label>
              </>
            )}
          </fieldset>
        )}

        <label className="text-sm font-medium text-slate-700">
          Anything we should know?
          <textarea name="notes" rows={3} className={input} />
        </label>
      </div>

      <aside className="h-fit rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="font-display text-lg font-semibold text-navy-900">Order summary</h2>
        <ul className="mt-4 space-y-2 text-sm">
          {lines.map((l) => (
            <li key={l.id} className="flex justify-between gap-3">
              <span className="text-slate-700">
                {l.name}
                {l.unit === "per-foot" ? ` (${l.quantity} ft)` : l.quantity > 1 ? ` × ${l.quantity}` : ""}
              </span>
              <span className="shrink-0 font-medium tabular-nums">{formatPrice(l.price * l.quantity)}</span>
            </li>
          ))}
          {info.goods > 0 && (
            <li className="flex justify-between gap-3">
              <span className="text-slate-700">Delivery</span>
              <span className="font-medium tabular-nums">{info.delivery ? formatPrice(info.delivery) : "Free"}</span>
            </li>
          )}
        </ul>
        <div className="mt-4 flex justify-between border-t border-slate-200 pt-4 font-display text-lg font-bold text-navy-900">
          <span>Total</span>
          <span className="tabular-nums">{formatPrice(info.total)}</span>
        </div>
        <p className="mt-1 text-xs text-slate-500">Prices include VAT.</p>
        {status === "error" && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <button
          type="submit"
          disabled={status === "sending"}
          className="mt-5 w-full rounded-md bg-sea-600 px-5 py-3 font-semibold text-white transition hover:bg-sea-700 disabled:opacity-60"
        >
          {status === "sending" ? "Opening secure payment…" : `Pay ${formatPrice(info.total)} securely`}
        </button>
        <p className="mt-3 text-center text-xs text-slate-500">
          You&apos;ll pay by card on the secure myPOS payment page.
        </p>
      </aside>
    </form>
  );
}
