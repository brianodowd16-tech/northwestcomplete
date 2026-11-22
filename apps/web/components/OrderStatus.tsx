"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useLive } from "./useLive";

export function LiveRefresh({ slug, orderId, paid }: { slug: string; orderId: string; paid: boolean }) {
  const router = useRouter();
  useLive(slug, () => router.refresh(), orderId);
  useEffect(() => {
    // The basket is kept through a hosted checkout; clear it once the order is paid.
    if (!paid) return;
    try {
      sessionStorage.removeItem(`round-cart:${slug}:table`);
      sessionStorage.removeItem(`round-cart:${slug}:collect`);
    } catch {}
  }, [paid, slug]);
  return null;
}
