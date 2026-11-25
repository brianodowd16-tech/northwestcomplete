"use client";
import { useState } from "react";

/** "Forgot password" (email form) and "Set your password" (from an emailed link). */
export function StaffPasswordLink({ mode, token, who }: { mode: "forgot" | "reset"; token?: string; who?: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const done = !!msg;
  return (
    <form
      className="panel stack"
      style={{ maxWidth: 380, margin: "40px auto" }}
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        if (mode === "reset" && f.get("password") !== f.get("again")) return setError("The two passwords don't match");
        setBusy(true);
        setError(null);
        const res = await fetch(mode === "forgot" ? "/api/staff/forgot" : "/api/staff/reset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(mode === "forgot" ? { email: f.get("email") } : { token, password: f.get("password") }),
        });
        const d = await res.json();
        setBusy(false);
        if (!res.ok) return setError(d.error);
        setMsg(d.message);
      }}
    >
      <div className="label">Complete</div>
      <h1 style={{ fontSize: 24 }}>{mode === "forgot" ? "Forgot your password?" : "Set your password"}</h1>
      {who && <p className="muted small" style={{ margin: 0 }}>For {who}</p>}
      {!done && mode === "forgot" && <label className="field">Work email<input name="email" type="email" autoComplete="username" required /></label>}
      {!done && mode === "reset" && (
        <>
          <label className="field">New password (10+ characters)<input name="password" type="password" autoComplete="new-password" minLength={10} required /></label>
          <label className="field">Type it again<input name="again" type="password" autoComplete="new-password" minLength={10} required /></label>
        </>
      )}
      {error && <div className="error">{error}</div>}
      {msg && <div className="notice">{msg}</div>}
      {!done ? <button className="btn block" disabled={busy}>{mode === "forgot" ? "Email me a link" : "Set password"}</button> : <a className="btn block" href="/staff/login">Go to sign in</a>}
    </form>
  );
}
