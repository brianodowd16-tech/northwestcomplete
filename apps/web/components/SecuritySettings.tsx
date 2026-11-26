"use client";
import { useCallback, useEffect, useState } from "react";
import { PasskeyButton } from "./PasskeyButton";
import { toast } from "./Toasts";

type Key = { id: string; name: string; createdAt: string; lastUsedAt: string | null };
const when = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" }) : "never");

/** Passkeys (guests and staff) and, for staff, an authenticator app for two-step sign-in. */
export function SecuritySettings({ as }: { as: "guest" | "staff" }) {
  const [keys, setKeys] = useState<Key[]>([]);
  const [auth, setAuth] = useState(false);
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const load = useCallback(async () => {
    const r = await fetch(as === "staff" ? "/api/staff/security" : "/api/me/passkeys");
    if (!r.ok) return;
    const j = await r.json();
    setKeys(j.passkeys);
    setAuth(!!j.authenticator);
  }, [as]);
  useEffect(() => { load(); }, [load]);
  const post = async (body: object) => {
    const r = await fetch("/api/staff/security", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) { toast(j.error, { kind: "err" }); return null; }
    if (j.message) toast(j.message, { kind: "ok" });
    return j;
  };
  const remove = async (id: string) => {
    if (!confirm("Remove this passkey? You can add it again later.")) return;
    if (as === "staff") await post({ action: "removePasskey", id });
    else await fetch(`/api/me/passkeys?id=${id}`, { method: "DELETE" });
    load();
  };
  return (
    <div className="stack">
      <section className="panel stack">
        <h3>Passkeys</h3>
        <p className="muted small" style={{ margin: 0 }}>Sign in{as === "staff" ? " and clock in" : ""} with Face ID or Touch ID on Apple devices, Windows Hello, or your fingerprint or screen lock on Android, instead of {as === "staff" ? "a password" : "a text code"}. Passkeys sync through iCloud Keychain, Google Password Manager or your Microsoft account, and nobody can phish them.</p>
        {keys.length > 0 && (
          <table><tbody>{keys.map((k) => (
            <tr key={k.id}><td>{k.name}<div className="muted small">Added {when(k.createdAt)} · last used {when(k.lastUsedAt)}</div></td><td className="r"><button className="btn sm ghost" onClick={() => remove(k.id)}>Remove</button></td></tr>
          ))}</tbody></table>
        )}
        <div><PasskeyButton purpose="register" as={as} label={keys.length ? "Add another passkey" : "Add a passkey"} onDone={load} /></div>
      </section>
      {as === "staff" && (
        <section className="panel stack">
          <div className="row wrap"><h3>Authenticator app</h3><span className={`chip ${auth ? "ok" : "plain"}`}>{auth ? "On" : "Off"}</span></div>
          <p className="muted small" style={{ margin: 0 }}>With Microsoft Authenticator, Google Authenticator or any authenticator app, signing in with your password also needs a 6-digit code from your phone. Recommended for managers.</p>
          {!auth && !setup && <button className="btn sm" style={{ alignSelf: "flex-start" }} onClick={async () => { const j = await post({ action: "totpStart" }); if (j) setSetup(j); }}>Set up</button>}
          {setup && (
            <form className="stack" onSubmit={async (e) => { e.preventDefault(); const j = await post({ action: "totpConfirm", code: new FormData(e.currentTarget).get("code") }); if (j) { setSetup(null); load(); } }}>
              <div className="row wrap" style={{ justifyContent: "flex-start", gap: 16 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={setup.qr} width={180} height={180} alt="QR code for your authenticator app" />
                <div className="stack" style={{ gap: 6 }}>
                  <span className="small">1. Scan this with your authenticator app (or type the key).</span>
                  <code className="small" style={{ wordBreak: "break-all" }}>{setup.secret.replace(/(.{4})/g, "$1 ").trim()}</code>
                  <span className="small">2. Enter the 6-digit code it shows.</span>
                  <input name="code" className="field-input" inputMode="numeric" autoComplete="one-time-code" placeholder="123 456" required style={{ width: 140 }} />
                  <button className="btn sm" style={{ alignSelf: "flex-start" }}>Turn on</button>
                </div>
              </div>
            </form>
          )}
          {auth && (
            <form className="row wrap" style={{ justifyContent: "flex-start", gap: 6 }} onSubmit={async (e) => { e.preventDefault(); const j = await post({ action: "totpOff", code: new FormData(e.currentTarget).get("code") }); if (j) load(); }}>
              <input name="code" className="field-input" inputMode="numeric" placeholder="Current code" required style={{ width: 140 }} />
              <button className="btn sm ghost">Turn off</button>
            </form>
          )}
          <span className="muted small">Lost your phone? A manager can clear your authenticator and passkeys from Team.</span>
        </section>
      )}
    </div>
  );
}
