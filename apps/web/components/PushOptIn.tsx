"use client";
import { useEffect, useState } from "react";
import { toast } from "./Toasts";

const b64ToBytes = (b64: string) => {
  const s = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

type State = "hidden" | "ask" | "ios-install" | "on" | "blocked";

/** "Tell me when it's ready": a notification on this phone even if the app is closed. */
export function PushOptIn({ publicKey }: { publicKey: string | null }) {
  const [state, setState] = useState<State>("hidden");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!publicKey) return;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      if (ios && !standalone) setState("ios-install"); // iPhone: web notifications need the app on the home screen
      return;
    }
    if (Notification.permission === "denied") return setState("blocked");
    navigator.serviceWorker.getRegistration().then(async (reg) => {
      const sub = await reg?.pushManager.getSubscription();
      setState(sub && Notification.permission === "granted" ? "on" : "ask");
    });
  }, [publicKey]);

  async function enable() {
    setBusy(true);
    try {
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "blocked" : "ask");
        return;
      }
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey!) }));
      const res = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      if (!res.ok) throw new Error();
      setState("on");
      toast("We'll let you know when it's ready", { kind: "ok" });
    } catch {
      toast("Couldn't turn on notifications on this phone", { kind: "err" });
    } finally {
      setBusy(false);
    }
  }

  if (state === "hidden" || state === "on") return state === "on" ? <div className="chip ok" style={{ alignSelf: "flex-start" }}>🔔 We&apos;ll notify you when it&apos;s ready</div> : null;
  if (state === "blocked") return <div className="muted small">Notifications are blocked for this site. Turn them on in your browser settings to hear when it&apos;s ready.</div>;
  if (state === "ios-install")
    return (
      <div className="card" style={{ background: "var(--sunk)" }}>
        <b>Want a notification when it&apos;s ready?</b>
        <span className="muted small">On iPhone, add this app to your home screen first: tap Share, then “Add to Home Screen”, and open it from there.</span>
      </div>
    );
  return (
    <button className="btn ghost block" onClick={enable} disabled={busy}>
      🔔 {busy ? "Turning on…" : "Notify me when it's ready"}
    </button>
  );
}
