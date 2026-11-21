"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart";
import { formatPrice } from "@/lib/site";

export function CartView() {
  const { lines, subtotal, ready, setQuantity, remove } = useCart();

  if (!ready) return <p className="mt-8 text-slate-500">Loading…</p>;

  if (lines.length === 0) {
    return (
      <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
        <p className="text-slate-600">Your basket is empty.</p>
        <div className="mt-5 flex justify-center gap-3">
          <Link href="/services" className="rounded-md bg-sea-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sea-700">Book a service</Link>
          <Link href="/shop" className="rounded-md bg-navy-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-700">Visit the shop</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
      <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
        {lines.map((l) => {
          const perFoot = l.unit === "per-foot";
          const fixedQty = l.maxQty === 1;
          return (
            <li key={l.id} className="flex flex-wrap items-center gap-4 p-5">
              <div className="min-w-0 flex-1">
                <Link href={l.href} className="font-semibold text-navy-900 hover:text-sea-700">{l.name}</Link>
                <p className="text-sm text-slate-500">
                  {formatPrice(l.price)}{perFoot ? " per ft" : l.unit === "deposit" ? " deposit" : " each"}
                </p>
              </div>
              {!fixedQty && (
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  {perFoot ? "Length (ft)" : "Qty"}
                  <input
                    type="number"
                    min={l.minQty}
                    max={l.maxQty}
                    value={l.quantity}
                    onChange={(e) => setQuantity(l.id, Number(e.target.value) || l.minQty)}
                    className="w-20 rounded-md border border-slate-300 px-2 py-1.5"
                  />
                </label>
              )}
              <p className="w-24 text-right font-semibold text-navy-900">{formatPrice(l.price * l.quantity)}</p>
              <button onClick={() => remove(l.id)} className="text-sm text-slate-500 underline hover:text-red-600">
                Remove
              </button>
            </li>
          );
        })}
      </ul>

      <aside className="h-fit rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex justify-between text-lg font-semibold text-navy-900">
          <span>Subtotal</span>
          <span>{formatPrice(subtotal)}</span>
        </div>
        <p className="mt-1 text-sm text-slate-500">Includes VAT. Delivery calculated at checkout.</p>
        <Link
          href="/checkout"
          className="mt-5 block w-full rounded-md bg-sea-600 px-5 py-3 text-center font-semibold text-white transition hover:bg-sea-700"
        >
          Go to checkout
        </Link>
        <p className="mt-3 text-center text-xs text-slate-500">Secure card payment by myPOS.</p>
        <Link href="/shop" className="mt-4 block text-center text-sm font-medium text-sea-700 hover:text-sea-800">
          Continue shopping
        </Link>
      </aside>
    </div>
  );
}
