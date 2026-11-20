"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useCart } from "./cart";

/** Clears the basket once an order is paid; while waiting for myPOS's confirmation, re-checks for a minute. */
export function OrderStatusWatcher({ paid }: { paid: boolean }) {
  const { clear, ready } = useCart();
  const router = useRouter();

  useEffect(() => {
    if (paid && ready) clear();
  }, [paid, ready, clear]);

  useEffect(() => {
    if (paid) return;
    let n = 0;
    const t = setInterval(() => {
      if (++n > 15) return clearInterval(t);
      router.refresh();
    }, 4000);
    return () => clearInterval(t);
  }, [paid, router]);

  return null;
}
