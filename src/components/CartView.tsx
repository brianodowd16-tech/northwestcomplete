"use client";

import Image from "next/image";
import Link from "next/link";
import { formatPrice } from "@/lib/money";
import { useCart } from "./cart";

export function CartView() {
  const { lines, ready, subtotalCents, setQty, remove } = useCart();

  if (!ready) return <div className="panel" style={{ minHeight: 200 }} aria-busy="true" />;
  if (!lines.length) {
    return (
      <div className="empty">
        <p className="lead" style={{ margin: "0 auto 24px" }}>Your basket is empty.</p>
        <Link href="/shop" className="btn btn--primary">Browse special offers</Link>
      </div>
    );
  }

  return (
    <div className="layout-2">
      <div className="panel">
        {lines.map((l) => (
          <div key={l.id} className="line">
            <div className="line__img">{l.image && <Image src={l.image} alt="" fill sizes="88px" />}</div>
            <div>
              <Link href={`/shop/${l.slug}`} className="line__name">{l.name}</Link>
              <div className="line__actions">
                <div className="qty">
                  <button type="button" aria-label={`Decrease ${l.name}`} onClick={() => setQty(l.id, l.qty - 1)}>−</button>
                  <input type="number" aria-label={`Quantity of ${l.name}`} min={1} max={l.maxQty} value={l.qty} onChange={(e) => setQty(l.id, Number(e.target.value) || 1)} />
                  <button type="button" aria-label={`Increase ${l.name}`} onClick={() => setQty(l.id, l.qty + 1)}>+</button>
                </div>
                <button type="button" className="remove" onClick={() => remove(l.id)}>Remove</button>
              </div>
            </div>
            <strong>{formatPrice(l.priceCents * l.qty)}</strong>
          </div>
        ))}
      </div>
      <aside className="panel summary" aria-label="Order summary">
        <h2>Summary</h2>
        <div className="totals">
          <div><span>Subtotal</span><span>{formatPrice(subtotalCents)}</span></div>
          <div className="muted"><span>Click &amp; Collect</span><span>Free</span></div>
          <div className="grand"><span>Total</span><span>{formatPrice(subtotalCents)}</span></div>
        </div>
        <Link href="/checkout" className="btn btn--primary btn--block">Checkout securely</Link>
        <p className="secure">Prices include VAT. Collection from our Carrick-on-Shannon showroom.</p>
      </aside>
    </div>
  );
}
