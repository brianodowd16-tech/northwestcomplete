"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "./Toasts";

type Msg = { id: string; kind: string; body: string; at: string; from: string | null; mine: boolean };
type Member = { id: string; name: string; role: string; revolutUrl: string | null; me: boolean };
type Session = {
  id: string; kind: "session" | "party"; title: string; startsAt: string; endsAt: string; booked: boolean; mine: boolean; live: boolean;
  venue: { slug: string; name: string; timezone: string; songRequests: boolean };
  rsvps: { name: string; answer: string; me: boolean }[];
  orders: { id: string; number: number; who: string; totalCents: number; status: string; mine: boolean }[];
  songs: { title: string; link: string | null; status: string }[];
};
type Share = { id: string; name: string; me: boolean; cents: number; status: string; lines: string[] };
type Split = { id: string; title: string; totalCents: number; method: string; lines: { id: string; name: string; cents: number; ticket?: boolean }[]; at: string; paidBy: string; mine: boolean; shares: Share[] };
type Data = {
  detail: { id: string; name: string; inviteCode: string; playlistUrl: string | null; myRole: string; members: Member[] };
  messages: Msg[]; sessions: Session[];
  money: { splits: Split[]; settle: { from: string; to: string; cents: number; iOwe: boolean; owedToMe: boolean; payUrl: string | null }[] };
  orders: { id: string; label: string; lines: { id: string; name: string; cents: number }[]; byItem: boolean }[];
};

const eur = (c: number) => `€${(c / 100).toFixed(2)}`;
const SPOTIFY = /(https:\/\/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(?:track|album|playlist)\/[A-Za-z0-9]+)/;

/** Chat text: plain text, with Spotify links (only) made clickable. */
function Body({ text }: { text: string }) {
  const parts = text.split(SPOTIFY);
  return <>{parts.map((p, i) => (SPOTIFY.test(p) && i % 2 === 1 ? <a key={i} href={p} target="_blank" rel="noopener noreferrer">▶ Open in Spotify</a> : <span key={i}>{p}</span>))}</>;
}

export function GroupRoom({ id, venues, appUrl, myRevolut }: { id: string; venues: { slug: string; name: string }[]; appUrl: string; myRevolut: string }) {
  const [d, setD] = useState<Data | null>(null);
  const [tab, setTab] = useState<"chat" | "plans" | "money" | "people">("chat");
  const [text, setText] = useState("");
  const [splitOpen, setSplitOpen] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const load = useCallback(async () => {
    const r = await fetch(`/api/groups/${id}`);
    if (r.ok) setD(await r.json());
  }, [id]);
  useEffect(() => {
    load();
    const full = setInterval(() => !document.hidden && load(), 20_000);
    return () => clearInterval(full);
  }, [load]);
  // New chat messages every 4 seconds (one timer; skipped while the tab is hidden).
  const lastAt = useRef<string | null>(null);
  lastAt.current = d?.messages.at(-1)?.at ?? lastAt.current;
  const ready = !!d;
  useEffect(() => {
    if (!ready) return;
    const t = setInterval(async () => {
      if (document.hidden) return;
      const since = lastAt.current ? new Date(new Date(lastAt.current).getTime() + 1).toISOString() : new Date(0).toISOString();
      const r = await fetch(`/api/groups/${id}?since=${encodeURIComponent(since)}`);
      if (!r.ok) return;
      const { messages } = (await r.json()) as { messages: Msg[] };
      if (messages.length) setD((x) => (x ? { ...x, messages: [...x.messages, ...messages.filter((m) => !x.messages.some((y) => y.id === m.id))] } : x));
    }, 4000);
    return () => clearInterval(t);
  }, [ready, id]);
  useEffect(() => { if (tab === "chat") bottom.current?.scrollIntoView({ block: "end" }); }, [d?.messages.length, tab]);

  async function act(body: Record<string, unknown>, after?: () => void) {
    const r = await fetch(`/api/groups/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) return toast(j.error, { kind: "err" });
    if (typeof j.message === "string") toast(j.message, { kind: "ok" });
    after?.();
    await load();
  }

  if (!d) return <div className="empty">Loading…</div>;
  const invite = `${appUrl}/g/${d.detail.inviteCode}`;
  const when = (iso: string, tz: string) => new Date(iso).toLocaleString("en-IE", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const owe = d.money.settle.filter((s) => s.iOwe), owed = d.money.settle.filter((s) => s.owedToMe);

  return (
    <div className="stack">
      <div className="row wrap">
        <h1 style={{ fontSize: 24 }}>{d.detail.name}</h1>
        <span className="muted small">{d.detail.members.length} {d.detail.members.length === 1 ? "person" : "people"}</span>
      </div>
      <nav className="seg" aria-label="Group">
        {(["chat", "plans", "money", "people"] as const).map((k) => (
          <button key={k} type="button" aria-current={tab === k ? "page" : undefined} onClick={() => setTab(k)}>
            {{ chat: "Chat", plans: "Nights out", money: `Money${owe.length ? ` (${owe.length})` : ""}`, people: "People" }[k]}
          </button>
        ))}
      </nav>

      {tab === "chat" && (
        <section className="panel stack" style={{ gap: 8 }}>
          <div className="stack" style={{ gap: 6, maxHeight: 460, overflowY: "auto" }}>
            {d.messages.length === 0 && <div className="empty">Say hello 👋</div>}
            {d.messages.map((m) =>
              m.kind !== "text" && !m.from ? (
                <div key={m.id} className="muted small" style={{ textAlign: "center" }}><Body text={m.body} /></div>
              ) : (
                <div key={m.id} style={{ alignSelf: m.mine ? "flex-end" : "flex-start", maxWidth: "85%" }}>
                  {!m.mine && <div className="muted small">{m.from}</div>}
                  <div className="card" style={{ padding: "8px 12px", whiteSpace: "pre-wrap", overflowWrap: "anywhere", background: m.mine ? "var(--acc-soft, #eef6f1)" : undefined }}><Body text={m.body} /></div>
                  {!m.mine && <button className="muted small" style={{ background: "none", border: 0, padding: 0, cursor: "pointer" }} onClick={() => confirm("Report and hide this message for everyone?") && act({ action: "report", messageId: m.id })}>Report</button>}
                </div>
              ),
            )}
            <div ref={bottom} />
          </div>
          <form className="row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); if (text.trim()) act({ action: "message", body: text }, () => setText("")); }}>
            <input className="field-input" style={{ flex: 1, textAlign: "left" }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Message, or paste a Spotify song" maxLength={1000} aria-label="Message" />
            <button className="btn sm">Send</button>
          </form>
        </section>
      )}

      {tab === "plans" && (
        <>
          {d.sessions.length === 0 && <div className="empty">No nights out planned. Start one below.</div>}
          {d.sessions.map((s) => {
            const me = s.rsvps.find((r) => r.me)?.answer;
            const going = s.rsvps.filter((r) => r.answer === "going");
            return (
              <section key={s.id} className="panel stack" style={{ gap: 8 }}>
                <div className="row wrap">
                  <h3>{s.title}</h3>
                  <span className={`chip ${s.live ? "ok" : "plain"}`}>{s.live ? "On now" : s.kind === "party" ? "Party" : "Night out"}</span>
                </div>
                <div className="muted small">{s.venue.name} · {when(s.startsAt, s.venue.timezone)}{s.booked ? " · table booked" : ""}</div>
                <div className="row wrap" style={{ justifyContent: "flex-start", gap: 6 }}>
                  {(["going", "maybe", "no"] as const).map((a) => <button key={a} className={`btn sm ${me === a ? "" : "ghost"}`} onClick={() => act({ action: "rsvp", sessionId: s.id, answer: a })}>{{ going: "Going", maybe: "Maybe", no: "Can't" }[a]}</button>)}
                  <span className="muted small">{going.length} going{going.length ? `: ${going.map((r) => r.name).join(", ")}` : ""}</span>
                </div>
                {s.live && (
                  <>
                    <div className="row wrap" style={{ justifyContent: "flex-start", gap: 6 }}>
                      <a className="btn sm" href={`/v/${s.venue.slug}`}>Order at {s.venue.name}</a>
                      <span className="muted small">Everyone orders and pays for their own; the group sees it here. Share a cost in Money.</span>
                    </div>
                    {s.orders.length > 0 && (
                      <table><tbody>
                        {s.orders.map((o) => <tr key={o.id}><td>{o.who}</td><td className="small muted">#{o.number}{o.status === "refunded" ? " · refunded" : ""}</td><td className="r num">{eur(o.totalCents)}</td></tr>)}
                        <tr><td><b>Group total</b></td><td /><td className="r num"><b>{eur(s.orders.filter((o) => o.status === "paid").reduce((a, o) => a + o.totalCents, 0))}</b></td></tr>
                      </tbody></table>
                    )}
                    {s.venue.songRequests && (
                      <form className="stack" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); act({ action: "song", sessionId: s.id, title: f.get("title"), link: f.get("link") }, () => (e.target as HTMLFormElement).reset()); }}>
                        <div className="label">Ask for a song</div>
                        <div className="row wrap" style={{ gap: 6 }}>
                          <input name="title" className="field-input" style={{ flex: 2, minWidth: 160, textAlign: "left" }} placeholder="Song and artist" required />
                          <input name="link" className="field-input" style={{ flex: 2, minWidth: 160, textAlign: "left" }} placeholder="Spotify song link (optional)" />
                          <button className="btn sm">Request</button>
                        </div>
                        {s.songs.length > 0 && <div className="muted small">{s.songs.map((x) => `${x.status === "played" ? "✓" : x.status === "declined" ? "✗" : "•"} ${x.title}`).join("   ")}</div>}
                      </form>
                    )}
                  </>
                )}
                {s.mine && <button className="btn sm ghost" style={{ alignSelf: "flex-start" }} onClick={() => confirm("Cancel this for everyone?") && act({ action: "cancelSession", sessionId: s.id })}>Cancel</button>}
              </section>
            );
          })}
          <div className="two">
            <form className="panel stack" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); act({ action: "session", kind: "session", venue: f.get("venue") }); }}>
              <h3>We&apos;re out now</h3>
              <label className="field">Where<select name="venue" required>{venues.map((v) => <option key={v.slug} value={v.slug}>{v.name}</option>)}</select></label>
              <button className="btn sm" style={{ alignSelf: "flex-start" }}>Start the night</button>
            </form>
            <form className="panel stack" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); act({ action: "session", kind: "party", venue: f.get("venue"), title: f.get("title"), startsAt: new Date(String(f.get("when"))).toISOString(), hours: f.get("hours"), book: f.get("book") }); }}>
              <h3>Plan a party</h3>
              <label className="field">Where<select name="venue" required>{venues.map((v) => <option key={v.slug} value={v.slug}>{v.name}</option>)}</select></label>
              <label className="field">What<input name="title" placeholder="Aoife's 30th" maxLength={80} /></label>
              <label className="field">When<input name="when" type="datetime-local" required /></label>
              <div className="row" style={{ gap: 8 }}>
                <label className="field">Hours<input name="hours" type="number" min={1} max={12} defaultValue={5} /></label>
                <label className="field">Book a table for (0 = no)<input name="book" type="number" min={0} max={20} defaultValue={0} /></label>
              </div>
              <button className="btn sm" style={{ alignSelf: "flex-start" }}>Plan it</button>
            </form>
          </div>
          <form className="panel stack" onSubmit={(e) => { e.preventDefault(); act({ action: "playlist", url: new FormData(e.currentTarget).get("url") }); }}>
            <div className="row wrap"><h3>Group playlist</h3>{d.detail.playlistUrl && <a className="btn sm ghost" href={d.detail.playlistUrl} target="_blank" rel="noopener noreferrer">▶ Open in Spotify</a>}</div>
            <p className="muted small" style={{ margin: 0 }}>Share a collaborative Spotify playlist for the group to listen to together. Venues play song requests on their own licensed music system.</p>
            <div className="row" style={{ gap: 6 }}><input name="url" className="field-input" style={{ flex: 1, textAlign: "left" }} defaultValue={d.detail.playlistUrl ?? ""} placeholder="https://open.spotify.com/playlist/…" /><button className="btn sm">Save</button></div>
          </form>
        </>
      )}

      {tab === "money" && (
        <>
          <section className="panel stack" style={{ gap: 8 }}>
            <h3>Settle up</h3>
            {d.money.settle.length === 0 ? <div className="muted">Everyone&apos;s square. 🎉</div> : d.money.settle.map((s, i) => (
              <div key={i} className="row wrap">
                <span>{s.iOwe ? <b>You owe {s.to}</b> : s.owedToMe ? <b>{s.from} owes you</b> : `${s.from} owes ${s.to}`} <span className="num">{eur(s.cents)}</span></span>
                {s.payUrl && <a className="btn sm" href={s.payUrl} target="_blank" rel="noopener noreferrer">Pay with Revolut</a>}
              </div>
            ))}
            <span className="muted small">Money goes between you directly (Revolut, bank or cash); Complete never holds it. Mark shares paid below.</span>
          </section>
          {!splitOpen ? <button className="btn" onClick={() => setSplitOpen(true)}>Split a cost</button> : <SplitForm data={d} onDone={() => setSplitOpen(false)} act={act} />}
          {d.money.splits.map((s) => (
            <section key={s.id} className="panel stack" style={{ gap: 6 }}>
              <div className="row wrap"><h3>{s.title}</h3><span className="num"><b>{eur(s.totalCents)}</b></span></div>
              <div className="muted small">Paid by {s.mine ? "you" : s.paidBy} · split {s.method === "equal" ? "equally" : s.method === "items" ? "by item" : "by amounts"}{s.lines.some((l) => l.ticket) ? ` · ${s.lines.filter((l) => l.ticket).length} ticket line(s)` : ""}</div>
              <table><tbody>
                {s.shares.map((x) => (
                  <tr key={x.id}>
                    <td>{x.me ? "You" : x.name}{x.lines.length ? <div className="muted small">{x.lines.map((l) => s.lines.find((y) => y.id === l)?.name).filter(Boolean).join(", ")}</div> : null}</td>
                    <td className="r num">{eur(x.cents)}</td>
                    <td className="r">
                      {x.status === "owed" ? (
                        <span className="row" style={{ gap: 4, justifyContent: "flex-end" }}>
                          {(x.me || s.mine) && <button className="btn sm ghost" onClick={() => act({ action: "paid", shareId: x.id })}>{s.mine ? "Got it" : "Mark paid"}</button>}
                          {s.mine && !x.me && <button className="btn sm ghost" onClick={() => act({ action: "remind", shareId: x.id })}>Remind</button>}
                          {s.mine && !x.me && <button className="btn sm ghost" onClick={() => act({ action: "cover", shareId: x.id })}>Cover</button>}
                        </span>
                      ) : <span className={`chip ${x.status === "covered" ? "plain" : "ok"}`}>{x.status === "covered" ? "Covered" : "Paid"}</span>}
                    </td>
                  </tr>
                ))}
              </tbody></table>
              {s.mine && s.shares.every((x) => x.me || x.status === "owed") && <button className="btn sm ghost" style={{ alignSelf: "flex-start" }} onClick={() => act({ action: "cancelSplit", splitId: s.id })}>Cancel split</button>}
            </section>
          ))}
        </>
      )}

      {tab === "people" && (
        <>
          <section className="panel stack">
            <h3>Invite friends</h3>
            <div className="token">{invite}</div>
            <div className="row wrap" style={{ justifyContent: "flex-start", gap: 6 }}>
              <button className="btn sm" onClick={() => navigator.clipboard?.writeText(invite).then(() => toast("Link copied", { kind: "ok" }))}>Copy link</button>
              <a className="btn sm ghost" href={`https://wa.me/?text=${encodeURIComponent(`Join "${d.detail.name}" on Complete: ${invite}`)}`} target="_blank" rel="noopener noreferrer">Share on WhatsApp</a>
            </div>
            <span className="muted small">Anyone with the link can join (everyone on Complete is 18+). Removing someone changes the link.</span>
          </section>
          <section className="panel stack">
            <h3>People</h3>
            <table><tbody>
              {d.detail.members.map((m) => (
                <tr key={m.id}>
                  <td>{m.me ? "You" : m.name} {m.role === "owner" && <span className="chip plain">owner</span>}</td>
                  <td className="r">{d.detail.myRole === "owner" && !m.me && <button className="btn sm ghost" onClick={() => confirm(`Remove ${m.name}?`) && act({ action: "remove", customerId: m.id })}>Remove</button>}</td>
                </tr>
              ))}
            </tbody></table>
          </section>
          <form className="panel stack" onSubmit={async (e) => { e.preventDefault(); const r = await fetch("/api/me/social", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revolutHandle: new FormData(e.currentTarget).get("revolut") }) }); const j = await r.json(); toast(r.ok ? "Saved" : j.error, { kind: r.ok ? "ok" : "err" }); load(); }}>
            <h3>Get paid back</h3>
            <label className="field">Your Revolut handle (revolut.me/…)<input name="revolut" defaultValue={myRevolut} placeholder="yourname" /></label>
            <span className="muted small">Shown to your groups so they can pay you back in one tap.</span>
            <button className="btn sm" style={{ alignSelf: "flex-start" }}>Save</button>
          </form>
          <button className="btn ghost" onClick={() => confirm("Leave this group?") && act({ action: "leave" }, () => (location.href = "/me/groups"))}>Leave group</button>
        </>
      )}
    </div>
  );
}

function SplitForm({ data, onDone, act }: { data: Data; onDone: () => void; act: (b: Record<string, unknown>, after?: () => void) => Promise<void> }) {
  const others = data.detail.members;
  const [source, setSource] = useState<string>(data.orders[0]?.id ?? "custom");
  const [method, setMethod] = useState<"equal" | "items" | "custom">("equal");
  const [people, setPeople] = useState<string[]>(others.map((m) => m.id));
  const [lines, setLines] = useState<{ name: string; amount: string; ticket: boolean }[]>([{ name: "", amount: "", ticket: false }]);
  const [claims, setClaims] = useState<Record<string, string[]>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const custom = source === "custom";
  const order = data.orders.find((o) => o.id === source);
  const lineList = custom ? lines.map((l, i) => ({ id: `l${i}`, name: l.name || `Line ${i + 1}`, cents: Math.round(Number(l.amount || 0) * 100) })) : order?.lines ?? [];
  const canItems = custom || !!order?.byItem;
  return (
    <form className="panel stack" onSubmit={(e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      act({ action: "split", title: f.get("title"), method, people, orderId: custom ? undefined : source, lines: custom ? lines.filter((l) => l.name && l.amount) : undefined, claims: method === "items" ? claims : undefined, amounts: method === "custom" ? amounts : undefined }, onDone);
    }}>
      <div className="row wrap"><h3>Split a cost</h3><button type="button" className="btn sm ghost" onClick={onDone}>Close</button></div>
      <label className="field">What was it<input name="title" placeholder="Dinner, tickets, taxi…" maxLength={80} /></label>
      <label className="field">What you paid
        <select value={source} onChange={(e) => setSource(e.target.value)}>
          {data.orders.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          <option value="custom">Something else (tickets, taxi, a deposit…)</option>
        </select>
      </label>
      {custom && (
        <div className="stack" style={{ gap: 6 }}>
          {lines.map((l, i) => (
            <div key={i} className="row wrap" style={{ gap: 6 }}>
              <input className="field-input" style={{ flex: 2, minWidth: 140, textAlign: "left" }} placeholder={i === 0 ? "Gig tickets × 4" : "Item"} value={l.name} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <input className="field-input" style={{ width: 100 }} inputMode="decimal" placeholder="€" value={l.amount} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
              <label className="toggle small"><input type="checkbox" checked={l.ticket} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, ticket: e.target.checked } : x)))} /> Ticket</label>
            </div>
          ))}
          <button type="button" className="btn sm ghost" style={{ alignSelf: "flex-start" }} onClick={() => setLines([...lines, { name: "", amount: "", ticket: false }])}>Add a line</button>
        </div>
      )}
      <nav className="seg" aria-label="How to split">
        {(["equal", "items", "custom"] as const).map((m) => <button key={m} type="button" aria-current={method === m ? "page" : undefined} onClick={() => setMethod(m)} disabled={m === "items" && !canItems}>{{ equal: "Equally", items: "By item", custom: "By amount" }[m]}</button>)}
      </nav>
      <div className="stack" style={{ gap: 6 }}>
        {others.map((m) => (
          <div key={m.id} className="row wrap" style={{ gap: 6 }}>
            <label className="toggle" style={{ flex: 1 }}><input type="checkbox" checked={people.includes(m.id)} disabled={m.me} onChange={(e) => setPeople(e.target.checked ? [...people, m.id] : people.filter((p) => p !== m.id))} /> {m.me ? "You" : m.name}</label>
            {method === "custom" && people.includes(m.id) && <input className="field-input" style={{ width: 100 }} inputMode="decimal" placeholder="€" value={amounts[m.id] ?? ""} onChange={(e) => setAmounts({ ...amounts, [m.id]: e.target.value })} />}
            {method === "items" && people.includes(m.id) && (
              <span className="row wrap" style={{ gap: 4 }}>
                {lineList.map((l) => <label key={l.id} className="toggle small"><input type="checkbox" checked={(claims[m.id] ?? []).includes(l.id)} onChange={(e) => setClaims({ ...claims, [m.id]: e.target.checked ? [...(claims[m.id] ?? []), l.id] : (claims[m.id] ?? []).filter((x) => x !== l.id) })} /> {l.name}</label>)}
              </span>
            )}
          </div>
        ))}
      </div>
      {method === "items" && <span className="muted small">Tick what each person had. Anything nobody ticks is shared by everyone.</span>}
      {!canItems && <span className="muted small">Loyalty credit paid part of this order, so split it equally or by amount.</span>}
      <button className="btn" style={{ alignSelf: "flex-start" }}>Share the split</button>
    </form>
  );
}
