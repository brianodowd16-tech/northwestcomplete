"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { describeAnswers, labelFor, nextStep, recommend, stepsFor, type Answers, type Recommendation, type StepId } from "@/lib/consultation";
import { Icon } from "./Icon";

type Item =
  | { kind: "bot"; text: string }
  | { kind: "me"; text: string }
  | { kind: "reco"; reco: Recommendation }
  | { kind: "typing" };

type Qa = { role: "user" | "assistant"; content: string };

const GREETING =
  "Hello, and welcome to O'Dowd's. Answer a few quick questions and I'll put together advice for your project. Our team can then pick it up with you.";

export function Consultation({ aiEnabled, email }: { aiEnabled: boolean; email: string }) {
  const [answers, setAnswers] = useState<Answers>({});
  const [items, setItems] = useState<Item[]>([{ kind: "bot", text: GREETING }]);
  const [qa, setQa] = useState<Qa[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const step = nextStep(answers);
  const steps = stepsFor(answers);
  const done = !step;
  const reco = done ? recommend(answers) : null;
  const answered = steps.filter((s) => answers[s.id]).length;

  // Keep the newest message in view inside the panel (never scrolls the page).
  useEffect(() => {
    const el = bodyRef.current;
    if (el && items.length > 1) el.scrollTop = el.scrollHeight;
  }, [items, showForm, step]);

  function choose(id: StepId, optionId: string) {
    const nextAnswers = { ...answers, [id]: optionId };
    setAnswers(nextAnswers);
    const add: Item[] = [{ kind: "me", text: labelFor(id, optionId) }];
    if (!nextStep(nextAnswers)) {
      add.push({ kind: "bot", text: "Thanks, that's everything I need. Here's my recommendation:" }, { kind: "reco", reco: recommend(nextAnswers) });
    }
    setItems((prev) => [...prev, ...add]);
  }

  function restart() {
    setAnswers({});
    setQa([]);
    setShowForm(false);
    setSent(false);
    setFormError(null);
    setItems([{ kind: "bot", text: "No problem, let's start again." }]);
  }

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const text = question.trim();
    if (!text || busy) return;
    setQuestion("");
    const history: Qa[] = [...qa, { role: "user" as const, content: text }].slice(-12);
    setItems((prev) => [...prev, { kind: "me", text }, { kind: "typing" }]);
    setBusy(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history[0].role === "user" ? history : history.slice(1), context: done ? `${describeAnswers(answers)}. Recommendation: ${reco?.title}` : describeAnswers(answers) || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      const reply: string = res.ok ? data.reply : data.error || "Something went wrong. Please try again.";
      setItems((prev) => [...prev.filter((i) => i.kind !== "typing"), { kind: "bot", text: reply }]);
      if (res.ok) setQa([...history, { role: "assistant" as const, content: reply }]);
    } catch {
      setItems((prev) => [...prev.filter((i) => i.kind !== "typing"), { kind: "bot", text: "I couldn't reach the server. Please check your connection and try again." }]);
    } finally {
      setBusy(false);
    }
  }

  async function submitLead(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const f = new FormData(e.currentTarget);
    const payload = {
      name: String(f.get("name") ?? ""),
      email: String(f.get("email") ?? ""),
      town: String(f.get("town") ?? ""),
      message: String(f.get("message") ?? ""),
      company: String(f.get("company") ?? ""),
      consultation: [describeAnswers(answers), reco ? `Recommendation: ${reco.title}` : ""].filter(Boolean).join(" · "),
      priority: reco?.priority ?? "normal",
      source: "homepage-consultation",
    };
    setBusy(true);
    try {
      const res = await fetch("/api/enquiry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "We couldn't send your request.");
      setSent(true);
      setShowForm(false);
      setItems((prev) => [...prev, { kind: "bot", text: `Thank you, ${payload.name.split(" ")[0]}. Your request is with the team, and we'll be in touch by email to arrange your consultation.` }]);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const progress = done ? 100 : Math.round((answered / steps.length) * 100);

  return (
    <div className="consult__panel" aria-label="Online consultation">
      <div className="consult__bar">
        <div className="consult__avatar"><Icon name="flame" size={20} /></div>
        <div>
          <strong>O&apos;Dowd&apos;s consultation</strong>
          <span>Online now</span>
        </div>
        <div className="consult__progress">{done ? "Complete" : `Step ${answered + 1} of ${steps.length}`}</div>
      </div>
      <div className="consult__meter" aria-hidden="true"><i style={{ width: `${progress}%` }} /></div>

      <div className="consult__body" ref={bodyRef} aria-live="polite">
        {items.map((item, i) =>
          item.kind === "typing" ? (
            <div key={i} className="msg msg--bot msg--typing" aria-label="Typing"><i /><i /><i /></div>
          ) : item.kind === "reco" ? (
            <RecoCard key={i} reco={item.reco} />
          ) : (
            <div key={i} className={`msg msg--${item.kind}`}>
              {item.text.split("\n").filter(Boolean).map((p, j) => <p key={j}>{p}</p>)}
            </div>
          ),
        )}

        {step && (
          <>
            <div className="msg msg--bot" key={`q-${step.id}`}>
              <p><strong>{step.question}</strong></p>
              {step.help && <p className="muted" style={{ fontSize: ".85rem" }}>{step.help}</p>}
            </div>
            <div className="choices" role="group" aria-label={step.question}>
              {step.options.map((o) => (
                <button key={o.id} type="button" className="choice-btn" onClick={() => choose(step.id, o.id)}>
                  <strong>{o.label}</strong>
                  {o.hint && <small>{o.hint}</small>}
                </button>
              ))}
            </div>
          </>
        )}

        {done && !showForm && !sent && (
          <div className="consult__actions">
            <button type="button" className="btn btn--primary btn--sm" onClick={() => setShowForm(true)}>
              Request a consultation <Icon name="arrow" size={16} />
            </button>
            <button type="button" className="btn btn--outline btn--sm" onClick={restart}>Start again</button>
          </div>
        )}

        {showForm && (
          <form className="lead-form" onSubmit={submitLead}>
            <strong>Arrange a consultation with the team</strong>
            <p className="muted" style={{ margin: 0, fontSize: ".86rem" }}>We&apos;ll email you to arrange a showroom visit or a call back. Your answers above are included.</p>
            {formError && (
              <p className="alert alert--error" role="alert" style={{ margin: 0 }}>
                {formError} <a className="link" href={`mailto:${email}?subject=${encodeURIComponent("Consultation request")}&body=${encodeURIComponent(describeAnswers(answers))}`}>Email us</a>
              </p>
            )}
            <div className="row-2">
              <label htmlFor="lead-name">Name<input id="lead-name" name="name" autoComplete="name" required minLength={2} maxLength={80} /></label>
              <label htmlFor="lead-email">Email<input id="lead-email" name="email" type="email" autoComplete="email" required maxLength={120} /></label>
            </div>
            <label htmlFor="lead-town">Town or Eircode<input id="lead-town" name="town" autoComplete="address-level2" maxLength={80} /></label>
            <label htmlFor="lead-message">Anything else we should know? (optional)<textarea id="lead-message" name="message" maxLength={2000} placeholder="Room measurements, photos you can send, best times to reach you…" /></label>
            <div className="hp" aria-hidden="true"><label htmlFor="lead-company">Company</label><input id="lead-company" name="company" tabIndex={-1} autoComplete="off" /></div>
            <div className="consult__actions">
              <button type="submit" className="btn btn--primary btn--sm" disabled={busy}>{busy ? "Sending…" : "Send request"}</button>
              <button type="button" className="btn btn--outline btn--sm" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        )}

        {answered > 0 && !done && (
          <button type="button" className="text-btn" style={{ alignSelf: "flex-start" }} onClick={restart}>Start again</button>
        )}
      </div>

      {aiEnabled && (
        <form className="consult__foot" onSubmit={ask}>
          <label htmlFor="consult-question" className="sr-only">Ask a question</label>
          <input
            id="consult-question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask anything: sizing, flues, fuels, servicing…"
            maxLength={1500}
            autoComplete="off"
          />
          <button type="submit" className="btn btn--dark btn--sm" disabled={busy || !question.trim()} aria-label="Send question">
            <Icon name="send" size={16} />
          </button>
        </form>
      )}
    </div>
  );
}

function RecoCard({ reco }: { reco: Recommendation }) {
  return (
    <div className="reco">
      <div className="reco__head">
        <small>Our recommendation</small>
        <h4>{reco.title}</h4>
        <p>{reco.summary}</p>
      </div>
      {reco.points.length > 0 && (
        <ul>
          {reco.points.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}
      <div className="reco__links">
        {reco.links.map((l) => <Link key={l.href} href={l.href}>{l.label} →</Link>)}
      </div>
    </div>
  );
}
