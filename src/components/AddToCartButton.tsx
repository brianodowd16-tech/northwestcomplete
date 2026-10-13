"use client";

import { useState } from "react";
import type { CatalogItem } from "@/lib/catalog";
import { useCart } from "@/lib/cart";
import { Icon } from "./Icon";

type Props = {
  item: Pick<CatalogItem, "id" | "name" | "price" | "unit" | "minQty" | "maxQty" | "href" | "available">;
  /** Show a numeric input (quantity, or boat length for per-foot services). */
  withQuantity?: boolean;
  label?: string;
  className?: string;
};

export function AddToCartButton({ item, withQuantity = false, label, className = "" }: Props) {
  const { add } = useCart();
  const perFoot = item.unit === "per-foot";
  const [qty, setQty] = useState(perFoot ? 25 : 1);
  const [added, setAdded] = useState(false);

  if (!item.available) {
    return (
      <span className={`inline-flex items-center rounded-md bg-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-500 ${className}`}>
        Currently unavailable
      </span>
    );
  }

  function handleAdd() {
    add({
      id: item.id,
      name: item.name,
      price: item.price,
      unit: item.unit,
      minQty: item.minQty,
      maxQty: item.maxQty,
      href: item.href,
      quantity: qty,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 1800);
  }

  return (
    <div className={`flex flex-wrap items-end gap-3 ${className}`}>
      {(withQuantity || perFoot) && (
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600">{perFoot ? "Boat length (ft)" : "Qty"}</span>
          <input
            type="number"
            inputMode="numeric"
            min={item.minQty}
            max={item.maxQty}
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
            onBlur={() => setQty((q) => Math.min(item.maxQty, Math.max(item.minQty, Math.round(q) || item.minQty)))}
            className="w-24 rounded-md border border-slate-300 px-3 py-2 focus:border-sea-500 focus:outline-none focus:ring-2 focus:ring-sea-200"
          />
        </label>
      )}
      <button
        type="button"
        onClick={handleAdd}
        className="inline-flex items-center gap-2 rounded-md bg-sea-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sea-700 focus:outline-none focus:ring-2 focus:ring-sea-300"
      >
        <Icon name={added ? "check" : "cart"} className="h-4 w-4" />
        {added ? "Added to basket" : label ?? (item.unit === "deposit" ? "Pay deposit" : "Add to basket")}
      </button>
    </div>
  );
}
