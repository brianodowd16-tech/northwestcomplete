"use client";
import { useEffect } from "react";

export function RegisterSW() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // In development only when testing push (the cache would get in the way of hot reload).
    let devSw = false;
    try {
      devSw = !!localStorage.getItem("complete-dev-sw");
    } catch {}
    if (process.env.NODE_ENV !== "production" && !devSw) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
