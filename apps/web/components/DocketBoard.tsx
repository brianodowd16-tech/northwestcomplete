"use client";
import { LATE_AFTER_MS, STATUS_LABELS, nextStatus, type DocketStatus } from "@round/core/dockets";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "./Toasts";

export interface DocketView {
  id: string;
  status: DocketStatus;
  createdAt: string;
  orderNumber: number;
  channel: "table" | "collect";
  tableNumber: number | null;
  guestFirstName: string;
  guestAge: number;
  idCheckRequired: boolean;
  idCheckedAt: string | null;
  lines: { name: string; qty: number; containsAlcohol: boolean }[];
}

const ACTION: Record<"bar" | "kitchen", Record<string, string>> = {
  bar: { new: "Start pouring", in_progress: "Mark ready", ready: "Collected" },
  kitchen: { new: "Start cooking", in_progress: "Ready", ready: "Served" },
};
const DOCS = [
  ["age_card", "Age card"],
  ["passport", "Passport"],
  ["driving_licence", "Licence"],
] as const;

/** Two short tones, generated (no audio file needed). Browsers allow it after a tap on the page. */
function chime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.18].forEach((delay, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = i ? 1046 : 784;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + delay);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + delay + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + 0.25);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + delay);
      o.stop(ctx.currentTime + delay + 0.3);
    });
    setTimeout(() => ctx.close(), 800);
  } catch {}
}

export function DocketBoard({ slug, station, initial }: { slug: string; station: "bar" | "kitchen"; initial: DocketView[] }) {
  const [dockets, setDockets] = useState<DocketView[]>(initial);
  const [now, setNow] = useState(() => Date.now());
  const [live, setLive] = useState(false);
  const [sound, setSound] = useState(false);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [confirmRefuse, setConfirmRefuse] = useState<string | null>(null);
  const known = useRef(new Set(initial.map((d) => d.id)));
  const soundRef = useRef(false);

  useEffect(() => {
    try {
      const on = localStorage.getItem("snug-sound") === "1";
      setSound(on);
      soundRef.current = on;
    } catch {}
  }, []);

  const load = useCallback(async () => {
    const res = await fetch(`/api/staff/dockets?station=${station}`, { cache: "no-store" });
    if (!res.ok) return;
    const next = (await res.json()).dockets as DocketView[];
    const added = next.filter((d) => !known.current.has(d.id) && d.status === "new");
    next.forEach((d) => known.current.add(d.id));
    if (added.length) {
      setFresh((f) => new Set([...f, ...added.map((d) => d.id)]));
      setTimeout(() => setFresh((f) => new Set([...f].filter((id) => !added.some((a) => a.id === id)))), 5000);
      if (soundRef.current) chime();
      toast(`${added.length === 1 ? "New order" : `${added.length} new orders`} for the ${station}`, { kind: "ok" });
    }
    setDockets(next);
  }, [station]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    const es = new EventSource(`/api/stream?venue=${encodeURIComponent(slug)}`);
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    es.onmessage = (e) => {
      setLive(true);
      if ((JSON.parse(e.data) as { kind: string }).kind !== "hello") load();
    };
    return () => {
      clearInterval(t);
      es.close();
    };
  }, [slug, load]);

  async function post(id: string, body: object) {
    const res = await fetch(`/api/staff/dockets/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error((await res.json()).error ?? "That didn't work");
  }

  async function advance(d: DocketView) {
    const to = nextStatus(d.status)!;
    setDockets((ds) => ds.map((x) => (x.id === d.id ? { ...x, status: to } : x))); // instant on screen
    try {
      await post(d.id, { action: "advance", to });
      toast(`#${d.orderNumber} ${STATUS_LABELS[station][to].toLowerCase()}`, {
        action: {
          label: "Undo",
          run: () =>
            post(d.id, { action: "undo" })
              .then(load)
              .catch((e) => toast(e.message, { kind: "err" })),
        },
        ms: 6000,
      });
    } catch (e) {
      toast((e as Error).message, { kind: "err" });
    }
    load();
  }

  async function act(d: DocketView, body: object, done: string) {
    try {
      await post(d.id, body);
      toast(done, { kind: "ok" });
    } catch (e) {
      toast((e as Error).message, { kind: "err" });
    }
    setConfirmRefuse(null);
    load();
  }

  const toggleSound = () => {
    const on = !sound;
    setSound(on);
    soundRef.current = on;
    try {
      localStorage.setItem("snug-sound", on ? "1" : "0");
    } catch {}
    if (on) chime();
  };

  const lanes: DocketStatus[] = ["new", "in_progress", "ready"];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const done = dockets.filter((d) => d.status === "done" && new Date(d.createdAt) >= today).length;
  return (
    <>
      <div className="stafftop">
        <div className="row" style={{ gap: 14 }}>
          <h1 style={{ fontSize: 28 }}>{station === "bar" ? "Bar" : "Kitchen"}</h1>
          <span className={`live${live ? " on" : ""}`}>
            <i /> {live ? "Live" : "Reconnecting…"}
          </span>
        </div>
        <div className="row">
          <span className="chip plain num">{done} done today</span>
          <button className={`btn sm ${sound ? "" : "ghost"}`} onClick={toggleSound} aria-pressed={sound}>
            {sound ? "Sound on" : "Sound off"}
          </button>
        </div>
      </div>
      <div className="lanes">
        {lanes.map((lane) => {
          const list = dockets.filter((d) => d.status === lane);
          return (
            <section className="lane" key={lane}>
              <h3>
                {STATUS_LABELS[station][lane]}
                <span className="cnt num">{list.length}</span>
              </h3>
              {list.length === 0 && <div className="empty">{lane === "new" ? "Waiting for orders" : "Nothing here"}</div>}
              {list.map((d) => {
                const age = now - new Date(d.createdAt).getTime();
                const mins = Math.floor(age / 60_000);
                const needsId = d.idCheckRequired && !d.idCheckedAt;
                const late = age > LATE_AFTER_MS[station] && d.status !== "ready";
                return (
                  <article className={`docket${needsId ? " idcheck" : ""}${late && !needsId ? " lateb" : ""}${fresh.has(d.id) ? " fresh" : ""}`} key={d.id}>
                    <div className="dh big">
                      <span>
                        #{d.orderNumber} · {d.channel === "collect" ? "COLLECT" : `TABLE ${d.tableNumber}`}
                      </span>
                      <span className={late ? "late" : ""}>{mins < 1 ? "now" : `${mins} min`}</span>
                    </div>
                    {needsId && (
                      <div className="idbanner">
                        <span>CHECK ID</span>
                        <span>
                          {d.guestFirstName} · {d.guestAge} by date of birth
                        </span>
                      </div>
                    )}
                    {d.lines.map((l, i) => (
                      <div key={i} className="big">
                        <b>{l.qty} ×</b> {l.name}
                      </div>
                    ))}
                    <div className="muted" style={{ fontSize: 12 }}>
                      {d.guestFirstName}
                      {d.idCheckRequired && d.idCheckedAt ? " · ID checked" : ""}
                    </div>
                    <div className="acts">
                      {needsId && d.status === "ready" ? (
                        <>
                          {DOCS.map(([k, label]) => (
                            <button key={k} className="btn sm" onClick={() => act(d, { action: "id_check", documentType: k }, `ID checked for ${d.guestFirstName}`)}>
                              ✓ {label}
                            </button>
                          ))}
                          {confirmRefuse === d.id ? (
                            <>
                              <button className="btn sm danger" onClick={() => act(d, { action: "refuse" }, `Order #${d.orderNumber} refunded`)}>
                                Confirm refund
                              </button>
                              <button className="btn sm ghost" onClick={() => setConfirmRefuse(null)}>
                                Keep
                              </button>
                            </>
                          ) : (
                            <button className="btn sm danger" onClick={() => setConfirmRefuse(d.id)}>
                              Refuse &amp; refund
                            </button>
                          )}
                        </>
                      ) : (
                        <button className="btn block" style={{ padding: 13 }} onClick={() => advance(d)}>
                          {ACTION[station][d.status]}
                          {station === "kitchen" && d.status === "ready" && d.tableNumber ? ` to table ${d.tableNumber}` : ""}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </section>
          );
        })}
      </div>
    </>
  );
}
