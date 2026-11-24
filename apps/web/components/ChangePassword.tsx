"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ChangePassword({ forced }: { forced: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="panel stack"
      style={{ maxWidth: 420, margin: "40px auto" }}
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        if (f.get("next") !== f.get("again")) return setError("The new passwords don't match");
        setBusy(true);
        setError(null);
        const res = await fetch("/api/staff/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ current: f.get("current"), next: f.get("next") }) });
        const d = await res.json();
        setBusy(false);
        if (!res.ok) return setError(d.error);
        router.push(`/staff/${d.slug}/bar`);
      }}
    >
      <h1 style={{ fontSize: 24 }}>{forced ? "Choose your own password" : "Change password"}</h1>
      {forced && <p className="muted small" style={{ margin: 0 }}>You signed in with a one-time password. Pick one only you know.</p>}
      <label className="field">
        {forced ? "One-time password" : "Current password"}
        <input name="current" type="password" autoComplete="current-password" required />
      </label>
      <label className="field">
        New password (10+ characters)
        <input name="next" type="password" autoComplete="new-password" minLength={10} required />
      </label>
      <label className="field">
        New password again
        <input name="again" type="password" autoComplete="new-password" minLength={10} required />
      </label>
      {error && <div className="error">{error}</div>}
      <button className="btn block" disabled={busy}>
        Save password
      </button>
    </form>
  );
}
