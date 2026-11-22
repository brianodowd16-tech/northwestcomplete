"use client";
import { useEffect, useRef } from "react";
import { toast } from "./Toasts";

type Status = "new" | "in_progress" | "ready" | "done";

/**
 * Watches this order's dockets as the page refreshes live, and tells the guest the
 * moment something is ready: banner, vibration and a tab-title cue.
 */
export function OrderAlerts({ slug, paid, dockets }: { slug: string; paid: boolean; dockets: { station: "bar" | "kitchen"; status: Status }[] }) {
  const prev = useRef<Record<string, Status> | null>(null);
  const key = dockets.map((d) => `${d.station}:${d.status}`).join(",");

  useEffect(() => {
    const now = Object.fromEntries(dockets.map((d) => [d.station, d.status]));
    const before = prev.current;
    prev.current = now;
    if (!before) return;
    const became = (station: string, s: Status) => now[station] === s && before[station] !== s;
    let message: string | null = null;
    if (became("bar", "ready")) message = "Your drinks are ready at the bar";
    else if (became("kitchen", "ready")) message = "Your food is on its way to your table";
    else if (became("bar", "in_progress")) toast("The bar has started your drinks");
    else if (became("kitchen", "in_progress")) toast("The kitchen is cooking your food");
    if (message) {
      toast(message, { kind: "ok", ms: 6000 });
      try {
        navigator.vibrate?.([200, 100, 200]);
      } catch {}
      const title = document.title;
      document.title = `Ready! · ${title}`;
      setTimeout(() => (document.title = title), 8000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

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
