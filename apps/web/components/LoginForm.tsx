"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Something went wrong");
  return data;
}

export function LoginForm({ next, venueName }: { next: string; venueName: string }) {
  const router = useRouter();
  const [step, setStep] = useState<"phone" | "code" | "profile">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = (fn: () => Promise<void>) => async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const done = () => {
    router.push(next);
    router.refresh();
  };

  if (step === "phone")
    return (
      <form key="phone" className="stack" onSubmit={run(async () => {
        const d = await post("/api/auth/otp", { phone });
        setPhone(d.phone);
        setDevCode(d.devCode ?? null);
        setStep("code");
      })}>
        <h1 style={{ fontSize: 26 }}>Sign in or join</h1>
        <p className="muted" style={{ margin: 0 }}>We&apos;ll text you a code. Joining is free and you earn points at {venueName} on every order.</p>
        <label className="field">
          Mobile number
          <input type="tel" autoComplete="tel" inputMode="tel" placeholder="087 123 4567" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        </label>
        {error && <div className="error">{error}</div>}
        <button className="btn block" disabled={busy}>Send code</button>
      </form>
    );

  if (step === "code")
    return (
      <form key="code" className="stack" onSubmit={run(async () => {
        const d = await post("/api/auth/verify", { phone, code });
        if (d.status === "signed_in") done();
        else setStep("profile");
      })}>
        <h1 style={{ fontSize: 26 }}>Enter your code</h1>
        <p className="muted" style={{ margin: 0 }}>Sent to {phone}.</p>
        {devCode && <div className="notice">Test mode, no SMS sent. Your code is <b className="num">{devCode}</b>.</div>}
        <label className="field">
          6-digit code
          <input inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} required />
        </label>
        {error && <div className="error">{error}</div>}
        <button className="btn block" disabled={busy}>Continue</button>
        <button type="button" className="btn ghost block" onClick={() => setStep("phone")}>Use a different number</button>
      </form>
    );

  return (
    <form key="profile" className="stack" onSubmit={run(async () => {
      const f = new FormData(document.getElementById("profile") as HTMLFormElement);
      await post("/api/auth/signup", {
        name: f.get("name"),
        email: f.get("email"),
        dateOfBirth: f.get("dob"),
        marketingConsent: f.get("marketing") === "on",
      });
      done();
    })} id="profile">
      <h1 style={{ fontSize: 26 }}>Nearly there</h1>
      <label className="field">Name<input name="name" autoComplete="name" required /></label>
      <label className="field">Email (for receipts)<input name="email" type="email" autoComplete="email" required /></label>
      <label className="field">Date of birth<input name="dob" type="date" required /></label>
      <p className="muted small" style={{ margin: 0 }}>You must be 18 or over. The first time you order alcohol, bar staff will check your ID once.</p>
      <label className="toggle small">
        <input type="checkbox" name="marketing" /> Send me offers and news (optional)
      </label>
      {error && <div className="error">{error}</div>}
      <button className="btn block" disabled={busy}>Join</button>
    </form>
  );
}
