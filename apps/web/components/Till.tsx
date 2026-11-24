"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { eur } from "./format";
import { toast } from "./Toasts";

interface Item {
  id: string;
  name: string;
  priceCents: number;
  station: "bar" | "kitchen";
  soldOut: boolean;
}
interface Cat {
  id: string;
  name: string;
  items: Item[];
}
interface Sale {
  id: string;
  number: number;
  amountPaidCents: number;
  provider: string;
  status: string;
  paidAt: string | null;
  lines: { name: string; qty: number }[];
}
type Pay = null | { kind: "cash" } | { kind: "card"; waiting: boolean } | { kind: "room" };

/**
 * Card payments on the venue's myPOS terminal. Inside the Complete app on a myPOS Android terminal
 * the native MyposTerminal plugin takes the payment directly; otherwise staff key the amount into
 * the terminal and confirm here.
 */
async function terminalPay(amountCents: number, reference: string): Promise<{ approved: boolean; ref?: string } | null> {
  const plugin = (window as unknown as { Capacitor?: { Plugins?: { MyposTerminal?: { purchase: (o: object) => Promise<{ approved: boolean; authCode?: string }> } } } }).Capacitor?.Plugins?.MyposTerminal;
  if (!plugin) return null;
  const r = await plugin.purchase({ amountCents, currency: "EUR", reference });
  return { approved: r.approved, ref: r.authCode };
}

export function Till({ cats, recent, canRefundAll, hotel = false }: { cats: Cat[]; recent: Sale[]; canRefundAll: boolean; hotel?: boolean }) {
  const router = useRouter();
  const [cat, setCat] = useState(cats[0]?.id);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [table, setTable] = useState("");
  const [pay, setPay] = useState<Pay>(null);
  const [tendered, setTendered] = useState("");
  const [room, setRoom] = useState("");
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const items = useMemo(() => new Map(cats.flatMap((c) => c.items).map((i) => [i.id, i])), [cats]);
  const lines = Object.entries(cart).filter(([, q]) => q > 0).map(([id, qty]) => ({ item: items.get(id)!, qty }));
  const total = lines.reduce((s, l) => s + l.item.priceCents * l.qty, 0);
  const food = lines.some((l) => l.item.station === "kitchen");
  const add = (id: string, d: number) => setCart((c) => ({ ...c, [id]: Math.max(0, (c[id] ?? 0) + d) }));
  const reset = () => {
    setCart({});
    setTable("");
    setPay(null);
    setTendered("");
    setRoom("");
    setKey(crypto.randomUUID());
  };

  async function complete(method: "cash" | "card" | "room", extra: { tenderedCents?: number; cardRef?: string; roomNumber?: string }) {
    setBusy(true);
    try {
      const res = await fetch("/api/staff/till", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, method, lines: lines.map((l) => ({ menuItemId: l.item.id, qty: l.qty })), tableNumber: food ? Number(table) : null, ...extra }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      toast(`Sale #${d.number}: ${eur(d.totalCents)}${method === "cash" && d.changeCents ? ` · change ${eur(d.changeCents)}` : ""}${food ? ` · food to table ${table}` : ""}`, { kind: "ok" });
      reset();
      router.refresh();
    } catch (e) {
      toast((e as Error).message, { kind: "err" });
    } finally {
      setBusy(false);
    }
  }

  async function card() {
    setPay({ kind: "card", waiting: true });
    try {
      const r = await terminalPay(total, key.slice(0, 18));
      if (r === null) return setPay({ kind: "card", waiting: false }); // separate terminal: staff confirm
      if (!r.approved) {
        toast("Card declined on the terminal", { kind: "err" });
        return setPay(null);
      }
      await complete("card", { cardRef: r.ref });
    } catch {
      toast("The terminal didn't respond. Check it and try again.", { kind: "err" });
      setPay(null);
    }
  }

  const tenderedCents = Math.round(Number(tendered.replace(",", ".") || "0") * 100);
  return (
    <div className="till">
      <section className="stack" style={{ gap: 10, minWidth: 0 }}>
        <nav className="subtabs" aria-label="Menu sections">
          {cats.map((c) => (
            <button key={c.id} className="chipbtn" aria-current={cat === c.id ? "page" : undefined} onClick={() => setCat(c.id)}>
              {c.name}
            </button>
          ))}
        </nav>
        <div className="tillgrid">
          {cats
            .find((c) => c.id === cat)
            ?.items.map((i) => (
              <button key={i.id} className={`tillbtn ${i.station}`} disabled={i.soldOut || busy} onClick={() => add(i.id, 1)}>
                <b>{i.name}</b>
                <span className="num">{i.soldOut ? "Sold out" : eur(i.priceCents)}</span>
                {!!cart[i.id] && <span className="badge num">{cart[i.id]}</span>}
              </button>
            ))}
        </div>
        <details className="panel">
          <summary style={{ cursor: "pointer" }}>
            <b>Recent sales</b>
          </summary>
          <table style={{ marginTop: 8 }}>
            <tbody>
              {recent.map((s) => {
                const recentEnough = s.paidAt && Date.now() - new Date(s.paidAt).getTime() < 15 * 60_000;
                return (
                  <tr key={s.id}>
                    <td className="num">#{s.number}</td>
                    <td className="small">{s.lines.map((l) => `${l.qty} × ${l.name}`).join(", ")}</td>
                    <td className="small">{s.provider === "cash" ? "Cash" : s.provider === "room" ? "Room" : "Card"}</td>
                    <td className="r num">{eur(s.amountPaidCents)}</td>
                    <td className="r">
                      {s.status === "refunded" ? (
                        <span className="chip crit">Refunded</span>
                      ) : (canRefundAll || recentEnough) ? (
                        <button
                          className="btn sm ghost"
                          onClick={async () => {
                            if (!confirm(`Refund sale #${s.number} (${eur(s.amountPaidCents)})?${s.provider === "cash" ? " Give the cash back from the drawer." : " Refund the card on the myPOS terminal too."}`)) return;
                            const res = await fetch("/api/staff/till", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "refund", orderId: s.id }) });
                            const d = await res.json();
                            if (!res.ok) return toast(d.error, { kind: "err" });
                            toast(`Sale #${s.number} refunded`, { kind: "ok" });
                            router.refresh();
                          }}
                        >
                          Refund
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {recent.length === 0 && <div className="empty">No till sales yet.</div>}
        </details>
      </section>

      <aside className="panel stack tillcart">
        <h3>Current sale</h3>
        {lines.length === 0 ? (
          <div className="empty">Tap items to add them.</div>
        ) : (
          <div className="stack" style={{ gap: 4 }}>
            {lines.map((l) => (
              <div key={l.item.id} className="row">
                <span style={{ minWidth: 0 }}>
                  {l.qty} × {l.item.name}
                </span>
                <span className="row" style={{ gap: 6 }}>
                  <span className="num">{eur(l.item.priceCents * l.qty)}</span>
                  <button className="btn sm ghost" aria-label={`Remove one ${l.item.name}`} onClick={() => add(l.item.id, -1)}>
                    −
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
        {food && (
          <label className="field">
            Table for the food
            <input inputMode="numeric" value={table} onChange={(e) => setTable(e.target.value.replace(/\D/g, ""))} placeholder="e.g. 7" />
          </label>
        )}
        <div className="row total">
          <span>Total</span>
          <b className="num">{eur(total)}</b>
        </div>
        {!pay && (
          <div className="two" style={{ gap: 8 }}>
            <button className="btn block" disabled={!lines.length || busy || (food && !table)} onClick={() => setPay({ kind: "cash" })}>
              Cash
            </button>
            <button className="btn block" disabled={!lines.length || busy || (food && !table)} onClick={card}>
              Card
            </button>
            {hotel && (
              <button className="btn ghost block" style={{ gridColumn: "1 / -1" }} disabled={!lines.length || busy || (food && !table)} onClick={() => setPay({ kind: "room" })}>
                Charge to room
              </button>
            )}
          </div>
        )}
        {pay?.kind === "room" && (
          <div className="stack" style={{ gap: 8 }}>
            <label className="field">
              Room number
              <input value={room} onChange={(e) => setRoom(e.target.value.replace(/[^A-Za-z0-9-]/g, ""))} autoFocus />
            </label>
            <span className="muted small">Check the guest&apos;s name against the room before charging.</span>
            <div className="row" style={{ justifyContent: "flex-start" }}>
              <button className="btn" disabled={busy || !room} onClick={() => complete("room", { roomNumber: room })}>
                Charge {eur(total)} to room {room}
              </button>
              <button className="btn ghost" onClick={() => setPay(null)}>
                Back
              </button>
            </div>
          </div>
        )}
        {pay?.kind === "cash" && (
          <div className="stack" style={{ gap: 8 }}>
            <div className="qchips">
              {[total, Math.ceil(total / 500) * 500, Math.ceil(total / 1000) * 1000, Math.ceil(total / 2000) * 2000, 5000]
                .filter((v, i, a) => v >= total && a.indexOf(v) === i)
                .slice(0, 4)
                .map((v) => (
                  <button key={v} onClick={() => setTendered((v / 100).toFixed(2))}>
                    {v === total ? "Exact" : eur(v)}
                  </button>
                ))}
            </div>
            <label className="field">
              Cash given (€)
              <input inputMode="decimal" value={tendered} onChange={(e) => setTendered(e.target.value)} autoFocus />
            </label>
            {tenderedCents >= total && <div className="notice">Change: <b className="num">{eur(tenderedCents - total)}</b></div>}
            <div className="row" style={{ justifyContent: "flex-start" }}>
              <button className="btn" disabled={busy || tenderedCents < total} onClick={() => complete("cash", { tenderedCents })}>
                Complete sale
              </button>
              <button className="btn ghost" onClick={() => setPay(null)}>
                Back
              </button>
            </div>
          </div>
        )}
        {pay?.kind === "card" && (
          <div className="stack" style={{ gap: 8 }}>
            {pay.waiting ? (
              <div className="notice">Waiting for the card on the terminal…</div>
            ) : (
              <>
                <div className="notice">
                  Take <b className="num">{eur(total)}</b> on the myPOS terminal, then confirm.
                </div>
                <div className="row" style={{ justifyContent: "flex-start" }}>
                  <button className="btn" disabled={busy} onClick={() => complete("card", {})}>
                    Approved
                  </button>
                  <button className="btn ghost" onClick={() => setPay(null)}>
                    Declined / cancel
                  </button>
                </div>
              </>
            )}
          </div>
        )}
        {lines.length > 0 && !pay && (
          <button className="btn ghost sm" onClick={reset}>
            Clear sale
          </button>
        )}
      </aside>
    </div>
  );
}
