"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type CartLine = {
  id: string;
  name: string;
  /** Unit price in cents — for display only, re-validated server-side. */
  price: number;
  quantity: number;
  unit: "item" | "per-foot" | "deposit" | "fixed";
  minQty: number;
  maxQty: number;
  href: string;
};

type CartContextValue = {
  lines: CartLine[];
  count: number;
  subtotal: number;
  ready: boolean;
  add: (line: CartLine) => void;
  setQuantity: (id: string, quantity: number) => void;
  remove: (id: string) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "nwbm-cart-v1";

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setLines(JSON.parse(raw));
    } catch {
      // ignore unreadable storage
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      // storage unavailable (private mode etc.)
    }
  }, [lines, ready]);

  const add = useCallback((line: CartLine) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.id === line.id);
      if (!existing) return [...prev, { ...line, quantity: clamp(line.quantity, line.minQty, line.maxQty) }];
      // Per-foot and deposit lines are replaced rather than accumulated.
      const quantity = line.unit === "item" || line.unit === "fixed" ? existing.quantity + line.quantity : line.quantity;
      return prev.map((l) => (l.id === line.id ? { ...l, quantity: clamp(quantity, l.minQty, l.maxQty) } : l));
    });
  }, []);

  const setQuantity = useCallback((id: string, quantity: number) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, quantity: clamp(quantity, l.minQty, l.maxQty) } : l)));
  }, []);

  const remove = useCallback((id: string) => setLines((prev) => prev.filter((l) => l.id !== id)), []);
  const clear = useCallback(() => setLines([]), []);

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      ready,
      count: lines.reduce((n, l) => n + (l.unit === "per-foot" ? 1 : l.quantity), 0),
      subtotal: lines.reduce((n, l) => n + l.price * l.quantity, 0),
      add,
      setQuantity,
      remove,
      clear,
    }),
    [lines, ready, add, setQuantity, remove, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}
