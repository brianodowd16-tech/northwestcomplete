"use client";
import { LATE_AFTER_MS, STATUS_LABELS, nextStatus, type DocketStatus } from "@round/core/dockets";
import { useCallback, useEffect, useState } from "react";
import { useLive } from "./useLive";

interface Docket {
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

export function DocketBoard({ slug, station }: { slug: string; station: "bar" | "kitchen" }) {
  const [dockets, setDockets] = useState<Docket[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    const res = await fetch(`/api/staff/dockets?station=${station}`, { cache: "no-store" });
    if (res.ok) setDockets((await res.json()).dockets);
  }, [station]);

  useEffect(() => {
    load();
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, [load]);
  useLive(slug, load);

  async function act(id: string, body: object) {
    setError(null);
    const res = await fetch(`/api/staff/dockets/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) setError((await res.json()).error);
    load();
  }

  const lanes: DocketStatus[] = ["new", "in_progress", "ready"];
  const done = dockets.filter((d) => d.status === "done").length;
  return (
    <>
      <div className="stationhead">
        <h1>{station === "bar" ? "Bar" : "Kitchen"}</h1>
        <span className="chip plain">{done} completed today</span>
      </div>
      {error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="lanes">
        {lanes.map((lane) => {
          const list = dockets.filter((d) => d.status === lane);
          return (
            <section className="lane" key={lane}>
              <h3>
                {STATUS_LABELS[station][lane]}
                <span className="muted num">{list.length}</span>
              </h3>
              {list.length === 0 && <div className="empty">No dockets</div>}
              {list.map((d) => {
                const age = now - new Date(d.createdAt).getTime();
                const mins = Math.floor(age / 60_000);
                const needsId = d.idCheckRequired && !d.idCheckedAt;
                const to = nextStatus(d.status)!;
                return (
                  <article className={`docket${needsId ? " idcheck" : ""}`} key={d.id}>
                    <div className="dh">
                      <span>
                        #{d.orderNumber} · {d.channel === "collect" ? "COLLECT" : `TABLE ${d.tableNumber}`}
                      </span>
                      <span className={age > LATE_AFTER_MS[station] ? "late" : ""}>{mins} min</span>
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
                      <div key={i}>
                        {l.qty} × {l.name}
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
                            <button key={k} className="btn sm" onClick={() => act(d.id, { action: "id_check", documentType: k })}>
                              ✓ {label}
                            </button>
                          ))}
                          <button
                            className="btn sm danger"
                            onClick={() => confirm(`Refuse service and refund order #${d.orderNumber}?`) && act(d.id, { action: "refuse" })}
                          >
                            Refuse &amp; refund
                          </button>
                        </>
                      ) : (
                        <button className="btn sm" onClick={() => act(d.id, { action: "advance", to })}>
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
