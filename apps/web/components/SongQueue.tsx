"use client";
import { useCallback, useEffect, useState } from "react";
import { eur } from "./format";
import { toast } from "./Toasts";
import { useLive } from "./useLive";

export interface SongView { id: string; title: string; link: string | null; status: string; paidCents: number; createdAt: string }
interface Queue { waiting: SongView[]; queue: SongView[]; done: SongView[] }

/**
 * Song requests on the bar screen. A paid request appears the moment its payment is verified,
 * with one tap to accept and queue it (or decline, which refunds it). Updates live.
 */
export function SongQueue({ slug, initial, compact }: { slug: string; initial: Queue; compact?: boolean }) {
  const [q, setQ] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await fetch("/api/staff/songs", { cache: "no-store" });
    if (r.ok) setQ(await r.json());
  }, []);
  useLive(slug, load);
  useEffect(() => { const i = setInterval(load, 60_000); return () => clearInterval(i); }, [load]);
  async function act(id: string, action: "queue" | "played" | "decline") {
    if (action === "decline" && q.waiting.concat(q.queue).find((s) => s.id === id)?.paidCents && !confirm("Decline and refund this request?")) return;
    setBusy(id);
    const r = await fetch("/api/staff/songs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }) });
    const d = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) return toast(d.error ?? "Something went wrong", { kind: "err" });
    if (d.message) toast(d.message, { kind: "ok" });
    load();
  }
  if (compact && !q.waiting.length && !q.queue.length) return null;
  const row = (s: SongView, buttons: React.ReactNode, pos?: number) => (
    <div key={s.id} className="row" style={{ gap: 8, padding: "6px 0", borderTop: "1px solid var(--line)" }}>
      <span style={{ minWidth: 0 }}>
        {pos ? <b className="num">{pos}. </b> : null}<b>{s.title}</b>
        <span className="muted small" style={{ display: "block" }}>
          {s.paidCents ? <span className="chip ok">Paid {eur(s.paidCents)}</span> : <span className="chip plain">Group request</span>}
          {s.link ? <> · <a href={s.link} target="_blank" rel="noopener noreferrer">Spotify link</a></> : null}
        </span>
      </span>
      <span className="row" style={{ gap: 6, flexShrink: 0 }}>{buttons}</span>
    </div>
  );
  return (
    <section className="panel stack" style={{ gap: 4, marginBottom: 12 }} aria-live="polite">
      <div className="row"><b>🎵 Song requests</b><span className="chip plain">{q.waiting.length} new · {q.queue.length} queued</span></div>
      {q.waiting.map((s) => row(s, <>
        <button className="btn sm" disabled={busy === s.id} onClick={() => act(s.id, "queue")}>Accept &amp; queue</button>
        <button className="btn sm ghost" disabled={busy === s.id} onClick={() => act(s.id, "decline")}>{s.paidCents ? "Decline & refund" : "Not tonight"}</button>
      </>))}
      {q.queue.length > 0 && <span className="label" style={{ marginTop: 6 }}>Up next</span>}
      {q.queue.map((s, i) => row(s, <>
        <button className="btn sm" disabled={busy === s.id} onClick={() => act(s.id, "played")}>Played</button>
        <button className="btn sm ghost" disabled={busy === s.id} onClick={() => act(s.id, "decline")}>Skip</button>
      </>, i + 1))}
      {!compact && q.done.map((s) => row(s, <span className={`chip ${s.status === "played" ? "ok" : "plain"}`}>{s.status === "played" ? "Played" : s.status === "refunded" ? "Refunded" : "Declined"}</span>))}
      {!compact && !q.waiting.length && !q.queue.length && !q.done.length && <span className="muted small">No requests tonight.</span>}
    </section>
  );
}
