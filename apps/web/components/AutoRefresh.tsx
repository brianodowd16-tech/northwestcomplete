"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-renders the page from the server every few seconds (for lists staff keep open). */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => !document.hidden && router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
