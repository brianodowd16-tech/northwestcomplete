"use client";

import { useState } from "react";

export function ContactForm({ email }: { email: string }) {
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setState("busy");
    const f = new FormData(e.currentTarget);
    const payload = Object.fromEntries(["name", "email", "town", "message", "company"].map((k) => [k, String(f.get(k) ?? "")]));
    try {
      const res = await fetch("/api/enquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, source: "contact-page" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "We couldn't send your message.");
      setState("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState("idle");
    }
  }

  if (state === "sent") {
    return <p className="alert alert--ok" role="status">Thank you. Your message is with the team and we&apos;ll reply by email.</p>;
  }

  return (
    <form onSubmit={onSubmit}>
      {error && (
        <p className="alert alert--error" role="alert">
          {error} You can also email <a className="link" href={`mailto:${email}`}>{email}</a>.
        </p>
      )}
      <div className="row-2">
        <div className="field"><label htmlFor="c-name">Name</label><input id="c-name" name="name" autoComplete="name" required minLength={2} maxLength={80} /></div>
        <div className="field"><label htmlFor="c-email">Email</label><input id="c-email" name="email" type="email" autoComplete="email" required maxLength={120} /></div>
      </div>
      <div className="field"><label htmlFor="c-town">Town or Eircode (optional)</label><input id="c-town" name="town" autoComplete="address-level2" maxLength={80} /></div>
      <div className="field"><label htmlFor="c-message">How can we help?</label><textarea id="c-message" name="message" rows={5} required maxLength={2000} /></div>
      <div className="hp" aria-hidden="true"><label htmlFor="c-company">Company</label><input id="c-company" name="company" tabIndex={-1} autoComplete="off" /></div>
      <button type="submit" className="btn btn--dark" disabled={state === "busy"}>{state === "busy" ? "Sending…" : "Send message"}</button>
    </form>
  );
}
