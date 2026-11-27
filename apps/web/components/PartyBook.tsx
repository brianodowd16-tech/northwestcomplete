"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { eur } from "./format";
import { submitHostedCheckout, type CheckoutInfo } from "./Ordering";
import { toast } from "./Toasts";

export interface PackageView { id: string; name: string; description: string; pricePerPersonCents: number; minGuests: number; maxGuests: number; depositPerPersonCents: number; minNoticeDays: number }

/** Book a party package: pick it, the date, time and numbers; the total and any deposit update as you go. */
export function PartyBook({ slug, packages, signedIn, minDate }: { slug: string; packages: PackageView[]; signedIn: boolean; minDate: string }) {
  const router = useRouter();
  const [pid, setPid] = useState(packages[0]?.id ?? "");
  const p = packages.find((x) => x.id === pid);
  const [guests, setGuests] = useState(p?.minGuests ?? 20);
  const [busy, setBusy] = useState(false);
  if (!p) return null;
  const n = Math.max(0, Math.round(guests || 0));
  const deposit = p.depositPerPersonCents * n;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    try {
      const res = await fetch(`/api/v/${slug}/parties`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, packageId: pid, guests: n, idempotencyKey: crypto.randomUUID() }) });
      const d = (await res.json()) as { error?: string; orderId: string | null; checkout: CheckoutInfo | null };
      if (!res.ok) throw new Error(d.error ?? "Couldn't book that");
      const c = d.checkout;
      if (c?.redirect) return submitHostedCheckout(c.redirect);
      if (c?.provider === "revolut") {
        const { default: RevolutCheckout } = await import("@revolut/checkout");
        (await RevolutCheckout(c.token!, c.mode)).payWithPopup({ onSuccess: () => { toast("Deposit paid. The venue will confirm your booking.", { kind: "ok" }); router.refresh(); }, onError: (err: unknown) => toast(String(err), { kind: "err" }) });
        return;
      }
      if (c?.provider === "mock") {
        const r = await fetch("/api/dev/mock-pay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, orderId: d.orderId }) });
        if (!r.ok) throw new Error("Test payment failed");
      }
      toast(deposit ? "Deposit paid. The venue will confirm your booking." : "Request sent. The venue will confirm your booking.", { kind: "ok" });
      router.refresh();
    } catch (err) {
      toast((err as Error).message, { kind: "err" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="stack">
      <div className="stack" style={{ gap: 8 }} role="radiogroup" aria-label="Package">
        {packages.map((x) => (
          <label key={x.id} className="card" style={{ cursor: "pointer", borderColor: x.id === pid ? "var(--vacc)" : undefined }}>
            <span className="row"><span><input type="radio" name="pkg" checked={x.id === pid} onChange={() => { setPid(x.id); setGuests(Math.max(guests, x.minGuests)); }} /> <b>{x.name}</b></span><b className="num">{eur(x.pricePerPersonCents)} pp</b></span>
            <span className="muted small">{x.description}</span>
            <span className="small">Min. {x.minGuests} people{x.depositPerPersonCents ? ` · ${eur(x.depositPerPersonCents)} pp deposit to book` : " · nothing to pay until the night"} · book {x.minNoticeDays}+ day{x.minNoticeDays === 1 ? "" : "s"} ahead</span>
          </label>
        ))}
      </div>
      <div className="two">
        <label className="field">Date<input name="date" type="date" required min={minDate} /></label>
        <label className="field">Time<input name="time" type="time" required step={1800} defaultValue="19:00" /></label>
        <label className="field">Number of people<input type="number" min={p.minGuests} max={p.maxGuests} required value={guests} onChange={(e) => setGuests(Number(e.target.value))} /></label>
        <label className="field">Occasion (optional)<input name="occasion" maxLength={80} placeholder="30th birthday" /></label>
      </div>
      <label className="field">Anything we should know? (dietary needs, cake, music)<textarea name="notes" maxLength={500} rows={2} /></label>
      <div className="card">
        <div className="row"><span>{n} × {eur(p.pricePerPersonCents)}</span><b className="num">{eur(p.pricePerPersonCents * n)}</b></div>
        {n < p.minGuests && <span className="error">{p.name} is for at least {p.minGuests} people</span>}
        <span className="muted small">{deposit ? `Pay ${eur(deposit)} deposit now; the rest on the night. Refunded in full if the venue can't take it.` : "Nothing to pay now: you pay on the night."}</span>
      </div>
      {signedIn ? (
        <button className="btn block" disabled={busy || n < p.minGuests}>{busy ? "…" : deposit ? `Pay ${eur(deposit)} deposit & request` : "Send request"}</button>
      ) : (
        <button type="button" className="btn block" onClick={() => router.push(`/v/${slug}/login?next=${encodeURIComponent(`/v/${slug}/party`)}`)}>Sign in to book</button>
      )}
    </form>
  );
}
