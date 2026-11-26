"use client";
import { browserSupportsWebAuthn, startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { useEffect, useState } from "react";
import { toast } from "./Toasts";

/**
 * One button for every passkey job: add a passkey, sign in, or clock in/out. The device asks
 * for Face ID / Touch ID, Windows Hello, a fingerprint or PIN. Hidden where passkeys aren't supported.
 */
export function PasskeyButton({ purpose, as, venue, label, ghost, block, onDone }: {
  purpose: "register" | "login" | "clock"; as: "guest" | "staff"; venue?: string; label: string; ghost?: boolean; block?: boolean;
  onDone?: (result: Record<string, unknown>) => void;
}) {
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => setOk(browserSupportsWebAuthn()), []);
  if (!ok) return null;
  const post = (body: object) => fetch("/api/auth/passkey", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ purpose, as, venue, ...body }) }).then(async (r) => ({ ok: r.ok, j: await r.json() }));
  return (
    <button type="button" className={`btn ${ghost ? "ghost" : ""} ${block ? "block" : ""}`} disabled={busy} onClick={async () => {
      setBusy(true);
      try {
        const o = await post({ step: "options" });
        if (!o.ok) throw new Error(o.j.error);
        const response = purpose === "register" ? await startRegistration({ optionsJSON: o.j }) : await startAuthentication({ optionsJSON: o.j });
        const v = await post({ step: "verify", response });
        if (!v.ok) throw new Error(v.j.error);
        if (v.j.message) toast(v.j.message, { kind: "ok" });
        onDone?.(v.j);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Cancelling the Face ID / Windows Hello prompt isn't an error worth shouting about.
        toast(/NotAllowed|cancel|abort|timed out/i.test(msg) ? "Cancelled" : msg, { kind: /NotAllowed|cancel|abort/i.test(msg) ? "info" : "err" });
      } finally {
        setBusy(false);
      }
    }}>🔐 {busy ? "Waiting for your device…" : label}</button>
  );
}
