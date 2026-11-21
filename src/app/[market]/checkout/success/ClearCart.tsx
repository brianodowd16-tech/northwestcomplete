"use client";

import { useEffect } from "react";
import { useCart } from "@/lib/cart";

export function ClearCart({ enabled }: { enabled: boolean }) {
  const { clear, ready } = useCart();
  useEffect(() => {
    if (enabled && ready) clear();
  }, [enabled, ready, clear]);
  return null;
}
