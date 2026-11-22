"use client";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import { useLive } from "./useLive";

/** Refreshes the back office when orders or dockets change (at most every 2 seconds). */
export function LiveOffice({ slug }: { slug: string }) {
  const router = useRouter();
  const last = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useLive(slug, () => {
    const wait = Math.max(0, 2000 - (Date.now() - last.current));
    if (timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      last.current = Date.now();
      router.refresh();
    }, wait);
  });
  return null;
}
