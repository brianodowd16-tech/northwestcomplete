"use client";
import { useState } from "react";

const SUGGESTED = ["How did this week compare with last week?", "What are my best sellers this month?", "When is my busiest hour today?", "How much loyalty credit was redeemed this month?"];

/** "Ask your data": managers ask questions about their own venue's numbers. */
export function AskData({ slug, configured }: { slug: string; configured: boolean }) {
  const [log, setLog] = useState<{ q: string; a: string; err?: boolean }[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  async function ask(question: string) {
    if (!question.trim() || busy) return;
    setBusy(true);
    setQ("");
    setLog((l) => [...l, { q: question, a: "" }]);
    let a = "";
    let err = false;
    try {
      const res = await fetch(`/api/office/${slug}/assistant`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) });
      const d = await res.json();
      if (d.ok) a = d.answer;
      else {
        a = d.error ?? "Something went wrong";
        err = true;
      }
    } catch {
      a = "Couldn't reach the assistant. Check your connection.";
      err = true;
    }
    setLog((l) => [...l.slice(0, -1), { q: question, a, err }]);
    setBusy(false);
  }
  return (
    <section className="panel stack" aria-label="Ask your data">
      <div className="row">
        <h3>Ask your data</h3>
        <span className="chip plain">AI · your venue only</span>
      </div>
      {!configured ? (
        <p className="muted small" style={{ margin: 0 }}>Set ANTHROPIC_API_KEY on the server to switch this on. It answers from this venue&apos;s sales and loyalty numbers only, never guests&apos; personal details.</p>
      ) : (
        <>
          <div className="chat">
            {log.map((m, i) => (
              <div key={i} className="stack" style={{ gap: 6 }}>
                <div className="bubble me">{m.q}</div>
                <div className={`bubble ai${m.err ? " error" : ""}`}>{m.a || "Thinking…"}</div>
              </div>
            ))}
          </div>
          {log.length === 0 && (
            <div className="qchips">
              {SUGGESTED.map((s) => (
                <button key={s} onClick={() => ask(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}
          <form
            className="search"
            onSubmit={(e) => {
              e.preventDefault();
              ask(q);
            }}
          >
            <input placeholder="Ask about sales, best sellers, loyalty…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Ask a question" maxLength={1000} />
            <button className="btn sm" disabled={busy || !q.trim()}>
              Ask
            </button>
          </form>
        </>
      )}
    </section>
  );
}
