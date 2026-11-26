"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PasskeyButton } from "./PasskeyButton";

export function StaffLogin({ next }: { next?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [needsCode, setNeedsCode] = useState(false);
  const go = (d: { slug: string; mustChangePassword?: boolean }) => {
    if (d.mustChangePassword) return router.push("/staff/password");
    router.push(next && next.startsWith(`/staff/${d.slug}/`) || next?.startsWith(`/office/${d.slug}`) ? next : `/staff/${d.slug}/bar`);
  };
  return (
    <form
      className="panel stack"
      style={{ maxWidth: 380, margin: "40px auto" }}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const f = new FormData(e.currentTarget);
        const res = await fetch("/api/staff/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: f.get("email"), password: f.get("password"), code: f.get("code") || undefined }) });
        const d = await res.json();
        setBusy(false);
        if (d.needsCode) setNeedsCode(true);
        if (!res.ok) return setError(d.error);
        go(d);
      }}
    >
      <div className="label">Complete</div>
      <h1 style={{ fontSize: 24 }}>Staff sign in</h1>
      <label className="field">Email<input name="email" type="email" autoComplete="username" required /></label>
      <label className="field">Password<input name="password" type="password" autoComplete="current-password" required /></label>
      {needsCode && <label className="field">Code from your authenticator app<input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" required autoFocus /></label>}
      {error && <div className="error">{error}</div>}
      <button className="btn block" disabled={busy}>Sign in</button>
      <PasskeyButton purpose="login" as="staff" label="Sign in with a passkey" ghost block onDone={(d) => go(d as { slug: string })} />
      <p className="muted small" style={{ margin: 0, textAlign: "center" }}>
        <a href="/staff/forgot">Forgot your password?</a>
      </p>
      <p className="muted small" style={{ margin: 0, textAlign: "center" }}>
        New venue? <a href="/start">Start your free trial</a>
      </p>
    </form>
  );
}
