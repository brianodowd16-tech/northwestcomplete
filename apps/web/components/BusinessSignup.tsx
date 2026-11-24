"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

const KINDS: [string, string][] = [
  ["bar", "Bar or pub"],
  ["restaurant", "Restaurant"],
  ["hotel", "Hotel"],
  ["cafe", "Café"],
];

/** Self-serve sign-up for venues: verify an email, then create the venue in test mode. */
export function BusinessSignup() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "details">("email");
  const [email, setEmail] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function post(url: string, body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Something went wrong");
      return d;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  if (step === "email")
    return (
      <form
        key="email"
        className="panel stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const d = await post("/api/business/code", { email });
          if (!d) return;
          setEmail(d.email);
          setDevCode(d.devCode ?? null);
          setStep("details");
        }}
      >
        <div className="steps" aria-hidden>
          <span className="on" />
          <span />
        </div>
        <h2 style={{ fontSize: 22 }}>Start with your work email</h2>
        <p className="muted small" style={{ margin: 0 }}>We&apos;ll send a 6-digit code to check it&apos;s yours.</p>
        <label className="field">
          Email
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@yourvenue.ie" />
        </label>
        {error && <div className="error">{error}</div>}
        <button className="btn block" disabled={busy}>
          {busy ? "Sending…" : "Send code"}
        </button>
        <p className="muted small" style={{ margin: 0, textAlign: "center" }}>
          Already set up? <a href="/staff/login">Sign in</a>
        </p>
      </form>
    );

  return (
    <form
      key="details"
      className="panel stack"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const d = await post("/api/business/signup", {
          email,
          code: f.get("code"),
          venueName: f.get("venueName"),
          kind: f.get("kind"),
          town: f.get("town"),
          tables: Number(f.get("tables")),
          ownerName: f.get("ownerName"),
          password: f.get("password"),
          exampleMenu: f.get("exampleMenu") === "on",
          acceptTerms: f.get("acceptTerms") === "on",
          website: f.get("website"),
        });
        if (d) router.push(`/office/${d.slug}/setup?welcome=1`);
      }}
    >
      <div className="steps" aria-hidden>
        <span className="on" />
        <span className="on" />
      </div>
      <h2 style={{ fontSize: 22 }}>Tell us about your venue</h2>
      <label className="field">
        Code sent to {email}
        <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus />
      </label>
      {devCode && (
        <div className="notice">
          Test mode: your code is <b>{devCode}</b>. In the live app it arrives by email.
        </div>
      )}
      <div className="two">
        <label className="field">
          Venue name
          <input name="venueName" required maxLength={80} placeholder="The Corner House" />
        </label>
        <label className="field">
          Town
          <input name="town" maxLength={80} placeholder="Sligo" />
        </label>
        <label className="field">
          Kind of venue
          <select name="kind" defaultValue="bar">
            {KINDS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Tables with QR codes
          <input name="tables" type="number" min={0} max={200} defaultValue={20} required />
        </label>
        <label className="field">
          Your name
          <input name="ownerName" autoComplete="name" required maxLength={80} />
        </label>
        <label className="field">
          Password (10+ characters)
          <input name="password" type="password" autoComplete="new-password" minLength={10} required />
        </label>
      </div>
      {/* Honeypot: hidden from people, filled in by bots. */}
      <label aria-hidden style={{ position: "absolute", left: -9999, width: 1, height: 1, overflow: "hidden" }}>
        Website
        <input name="website" tabIndex={-1} autoComplete="off" />
      </label>
      <label className="toggle small">
        <input type="checkbox" name="exampleMenu" defaultChecked /> Start with an example menu I can edit
      </label>
      <label className="toggle small">
        <input type="checkbox" name="acceptTerms" required /> I agree to the terms of service and the data processing agreement
      </label>
      {error && <div className="error">{error}</div>}
      <button className="btn block" disabled={busy}>
        {busy ? "Setting up…" : "Create my venue"}
      </button>
      <button
        type="button"
        className="btn ghost sm"
        onClick={() => {
          setStep("email");
          setError(null);
        }}
      >
        Use a different email
      </button>
    </form>
  );
}
