"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function StaffLogin() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="panel stack"
      style={{ maxWidth: 380, margin: "40px auto" }}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const f = new FormData(e.currentTarget);
        const res = await fetch("/api/staff/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: f.get("email"), password: f.get("password") }) });
        const d = await res.json();
        setBusy(false);
        if (!res.ok) return setError(d.error);
        router.push(`/staff/${d.slug}/bar`);
      }}
    >
      <h1 style={{ fontSize: 24 }}>Staff sign in</h1>
      <label className="field">Email<input name="email" type="email" autoComplete="username" required /></label>
      <label className="field">Password<input name="password" type="password" autoComplete="current-password" required /></label>
      {error && <div className="error">{error}</div>}
      <button className="btn block" disabled={busy}>Sign in</button>
    </form>
  );
}
