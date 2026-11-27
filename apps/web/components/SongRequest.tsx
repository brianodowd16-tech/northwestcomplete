"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { eur } from "./format";
import { submitHostedCheckout, type CheckoutInfo } from "./Ordering";
import { toast } from "./Toasts";
import { useLive } from "./useLive";

interface Mine { id: string; title: string; status: string; position: number | null }
const STATUS: Record<string, string> = { requested: "With the bar", queued: "Queued", played: "Played", declined: "Not tonight", refunded: "Refunded" };

/** Pay to request a song. The bar gets it the moment the payment clears and taps Accept & queue. */
export function SongRequest({ slug, priceCents, signedIn }: { slug: string; priceCents: number; signedIn: boolean }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<Mine[]>([]);
  const [usePts, setUsePts] = useState(true);
  const load = () => fetch(`/api/v/${slug}/songs`, { cache: "no-store" }).then((r) => r.json()).then((d) => setMine(d.mine ?? [])).catch(() => {});
  useEffect(() => { if (signedIn) load(); }, [signedIn]); // eslint-disable-line react-hooks/exhaustive-deps
  useLive(slug, () => signedIn && load());

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!signedIn) return router.push(`/v/${slug}/login?next=/v/${slug}`);
    setBusy(true);
    try {
      const isLink = /^https:\/\/open\.spotify\.com\//.test(title.trim());
      const res = await fetch(`/api/v/${slug}/songs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: isLink ? "Spotify track" : title, link: isLink ? title.trim() : undefined, useWallet: usePts, idempotencyKey: crypto.randomUUID() }) });
      const d = (await res.json()) as { error?: string; orderId: string; checkout: CheckoutInfo | null };
      if (!res.ok) throw new Error(d.error ?? "Couldn't send that");
      const c = d.checkout;
      if (c?.redirect) return submitHostedCheckout(c.redirect);
      if (c?.provider === "revolut") {
        const { default: RevolutCheckout } = await import("@revolut/checkout");
        (await RevolutCheckout(c.token!, c.mode)).payWithPopup({ onSuccess: () => { toast("Paid: it's with the bar now", { kind: "ok" }); setTitle(""); load(); }, onError: (err: unknown) => toast(String(err), { kind: "err" }) });
        return;
      }
      if (c?.provider === "mock") {
        const r = await fetch("/api/dev/mock-pay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, orderId: d.orderId }) });
        if (!r.ok) throw new Error("Test payment failed");
      }
      toast("Paid: it's with the bar now", { kind: "ok" });
      setTitle("");
      load();
    } catch (err) {
      toast((err as Error).message, { kind: "err" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card stack" style={{ gap: 8 }}>
      <div className="row"><b>🎵 Request a song</b><span className="chip plain">{eur(priceCents)}</span></div>
      <form onSubmit={send} className="row" style={{ gap: 8 }}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={2} maxLength={200} placeholder="Song and artist, or a Spotify link" style={{ flex: 1, minWidth: 0 }} aria-label="Song" />
        <button className="btn sm" disabled={busy}>{busy ? "…" : "Pay & send"}</button>
      </form>
      {mine.map((s) => <div key={s.id} className="row small"><span>{s.title}</span><span className="muted">{s.position ? `#${s.position} in the queue` : STATUS[s.status] ?? s.status}</span></div>)}
      {signedIn && <label className="toggle small"><input type="checkbox" checked={usePts} onChange={(e) => setUsePts(e.target.checked)} /> Use my Complete Points if I have them</label>}
      <span className="muted small">Goes straight to the bar. If they can&apos;t play it tonight you get a full refund.</span>
    </section>
  );
}
