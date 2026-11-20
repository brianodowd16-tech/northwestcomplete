"use client";

import Link from "next/link";
import { useState } from "react";
import { useCart, type CartLine } from "./cart";

export function AddToCart({ line, disabled }: { line: Omit<CartLine, "qty">; disabled?: boolean }) {
  const { add } = useCart();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const clamp = (n: number) => Math.max(1, Math.min(line.maxQty, n || 1));

  if (disabled) return <button className="btn btn--dark btn--block" disabled>Sold out</button>;

  return (
    <>
      <div className="buybox">
        <div className="qty">
          <button type="button" aria-label="Decrease quantity" onClick={() => setQty((q) => clamp(q - 1))}>−</button>
          <input type="number" inputMode="numeric" aria-label="Quantity" min={1} max={line.maxQty} value={qty} onChange={(e) => setQty(clamp(Number(e.target.value)))} />
          <button type="button" aria-label="Increase quantity" onClick={() => setQty((q) => clamp(q + 1))}>+</button>
        </div>
        <button
          type="button"
          className="btn btn--primary"
          style={{ flex: 1 }}
          onClick={() => {
            add(line, qty);
            setAdded(true);
          }}
        >
          Add to basket
        </button>
      </div>
      <p role="status" aria-live="polite" style={{ minHeight: "1.6em" }}>
        {added && (
          <>
            Added to your basket. <Link href="/cart" className="link">View basket →</Link>
          </>
        )}
      </p>
    </>
  );
}
