"use client";
import { useEffect, useRef, useState } from "react";

type Turn = { role: "user" | "assistant"; content: string; error?: boolean };
const SUGGESTED = ["How are we doing compared to last week?", "What should I order from suppliers?", "When are we busiest?", "What's selling best this week?"];

/** The manager's assistant: a spoken-style briefing, then a conversation about the venue. */
export function ManagerAssistant({ slug, configured }: { slug: string; configured: boolean }) {
  const [brief, setBrief] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const post = (body: object) => fetch(`/api/office/${slug}/assistant`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());

  useEffect(() => {
    if (configured) post({ action: "brief" }).then((d) => d.ok && setBrief(d.answer)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured, slug]);
  useEffect(() => end.current?.scrollIntoView({ block: "nearest" }), [turns.length]);

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    const next: Turn[] = [...turns, { role: "user", content: question.trim() }];
    setTurns(next);
    setQ("");
    setBusy(true);
    try {
      const d = await post({ turns: next.filter((t) => !t.error).map(({ role, content }) => ({ role, content })) });
      setTurns([...next, d.ok ? { role: "assistant", content: d.answer } : { role: "assistant", content: d.error ?? "Something went wrong", error: true }]);
    } catch {
      setTurns([...next, { role: "assistant", content: "Couldn't reach the assistant. Try again.", error: true }]);
    } finally {
      setBusy(false);
    }
  }

  if (!configured) return <p className="muted small" style={{ margin: 0 }}>Ask questions about your numbers once the assistant is switched on (ANTHROPIC_API_KEY on the server).</p>;
  return (
    <div className="stack" style={{ gap: 10 }}>
      {brief && <p style={{ margin: 0, fontSize: 17, lineHeight: 1.5 }}>✨ {brief}</p>}
      {turns.map((t, i) => (
        <div key={i} style={{ alignSelf: t.role === "user" ? "flex-end" : "flex-start", maxWidth: "88%" }}>
          <div className={t.error ? "error" : "card"} style={{ whiteSpace: "pre-wrap", padding: "10px 14px", ...(t.role === "user" ? { background: "var(--ink)", color: "var(--bg)", borderColor: "var(--ink)" } : {}) }}>{t.content}</div>
        </div>
      ))}
      {busy && <div className="muted small">Thinking…</div>}
      <div ref={end} />
      {turns.length === 0 && (
        <div className="row wrap" style={{ justifyContent: "flex-start", gap: 6 }}>
          {SUGGESTED.map((s) => <button key={s} type="button" className="btn sm ghost" onClick={() => ask(s)}>{s}</button>)}
        </div>
      )}
      <form className="row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); ask(q); }}>
        <input className="field-input" style={{ flex: 1, textAlign: "left", fontSize: 16 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask anything about your venue…" aria-label="Ask the assistant" maxLength={1000} />
        <button className="btn" disabled={busy || !q.trim()}>Ask</button>
      </form>
    </div>
  );
}
