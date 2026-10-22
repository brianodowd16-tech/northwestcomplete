"use client";
import { useEffect, useRef } from "react";

/** Calls `onChange` whenever the server publishes for this venue (and order, if given). */
export function useLive(venueSlug: string, onChange: () => void, orderId?: string) {
  const cb = useRef(onChange);
  cb.current = onChange;
  useEffect(() => {
    const q = new URLSearchParams({ venue: venueSlug });
    if (orderId) q.set("order", orderId);
    const es = new EventSource(`/api/stream?${q}`);
    es.onmessage = (e) => {
      const d = JSON.parse(e.data) as { kind: string };
      if (d.kind !== "hello") cb.current();
    };
    return () => es.close();
  }, [venueSlug, orderId]);
}
