"use client";

import { vatFromGross } from "@round/core/money";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { eur } from "./format";
import { useLive } from "./useLive";

export interface MenuItemView {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  vatRate: 9 | 23;
  station: "bar" | "kitchen";
  containsAlcohol: boolean;
  availableForCollect: boolean;
  soldOut: boolean;
}

interface Props {
  slug: string;
  mode: "table" | "collect";
  qrToken?: string;
  tableNumber?: number;
  categories: { id: string; name: string; items: MenuItemView[] }[];
  member: { creditCents: number; doubles: number; pointsPerEuro: number; idChecked: boolean } | null;
}

type Cart = Record<string, number>;

interface CheckoutInfo {
  provider: "mock" | "revolut";
  token: string;
  publicKey: string | null;
  mode: "sandbox" | "prod";
}

export function Ordering({ slug, mode, qrToken, tableNumber, categories, member }: Props) {
  const router = useRouter();
  const path = usePathname();
  const storageKey = `round-cart:${slug}:${mode}`;
  const [cart, setCart] = useState<Cart>({});
  const [review, setReview] = useState(false);
  const [useCredit, setUseCredit] = useState(true);
  const [useDouble, setUseDouble] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ orderId: string; amountCents: number; checkout: CheckoutInfo } | null>(null);
  const [attemptKey, setAttemptKey] = useState<string | null>(null);

  useLive(slug, () => router.refresh());

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) setCart(JSON.parse(raw) as Cart);
    } catch {}
  }, [storageKey]);

  const save = (next: Cart) => {
    setCart(next);
    setAttemptKey(null); // a changed cart is a new order
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(next));
    } catch {}
  };

  const items = useMemo(() => new Map(categories.flatMap((c) => c.items).map((i) => [i.id, i])), [categories]);
  const lines = Object.entries(cart)
    .map(([id, qty]) => ({ item: items.get(id), qty }))
    .filter((l): l is { item: MenuItemView; qty: number } => !!l.item && l.qty > 0);
  const droppedSoldOut = lines.filter((l) => l.item.soldOut);

  useEffect(() => {
    if (droppedSoldOut.length) {
      const next = { ...cart };
      droppedSoldOut.forEach((l) => delete next[l.item.id]);
      save(next);
      setError(`${droppedSoldOut.map((l) => l.item.name).join(", ")} just sold out and was removed.`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [droppedSoldOut.length]);

  const gross = lines.reduce((s, l) => s + l.item.priceCents * l.qty, 0);
  const vat = (rate: 9 | 23) => lines.filter((l) => l.item.vatRate === rate).reduce((s, l) => s + vatFromGross(l.item.priceCents * l.qty, rate), 0);
  const credit = member && useCredit ? Math.min(member.creditCents, gross) : 0;
  const toPay = gross - credit;
  const points = member ? Math.floor((toPay * member.pointsPerEuro) / 100) * (useDouble && member.doubles > 0 ? 2 : 1) : 0;
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const hasAlcohol = lines.some((l) => l.item.containsAlcohol);

  const add = (id: string, d: number) => {
    const q = Math.max(0, Math.min(20, (cart[id] ?? 0) + d));
    const next = { ...cart, [id]: q };
    if (!q) delete next[id];
    save(next);
  };

  const finish = (orderId: string) => {
    try {
      sessionStorage.removeItem(storageKey);
    } catch {}
    router.push(`/v/${slug}/order/${orderId}`);
  };

  async function placeOrder() {
    if (!member) {
      router.push(`/v/${slug}/login?next=${encodeURIComponent(path)}`);
      return;
    }
    setBusy(true);
    setError(null);
    const key = attemptKey ?? crypto.randomUUID();
    setAttemptKey(key);
    try {
      const res = await fetch(`/api/v/${slug}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: mode,
          qrToken,
          lines: lines.map((l) => ({ menuItemId: l.item.id, qty: l.qty })),
          useCredit,
          useDouble,
          idempotencyKey: key,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't place the order");
      if (!data.checkout) return finish(data.orderId);
      setPending({ orderId: data.orderId, amountCents: data.amountCents, checkout: data.checkout });
      if (data.checkout.provider === "revolut") await payWithRevolut(data.orderId, data.checkout);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function payWithRevolut(orderId: string, c: CheckoutInfo) {
    const { default: RevolutCheckout } = await import("@revolut/checkout");
    const instance = await RevolutCheckout(c.token, c.mode);
    instance.payWithPopup({
      onSuccess: () => finish(orderId), // dockets release on the webhook, not here
      onError: (err: unknown) => setError(String(err)),
      onCancel: () => setPending(null),
    });
  }

  async function mockPay() {
    if (!pending) return;
    setBusy(true);
    try {
      const res = await fetch("/api/dev/mock-pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, orderId: pending.orderId }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Payment failed");
      finish(pending.orderId);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <div className="stack">
        <div>
          <div className="label">{mode === "table" ? `Table ${tableNumber}` : "Collect at the bar"}</div>
          <p className="muted small" style={{ margin: "4px 0 0" }}>
            {mode === "table"
              ? "Drinks: collect at the bar when they're ready. Food comes to your table."
              : "Drinks only. We'll tell you when they're ready to collect."}
          </p>
        </div>
        <nav className="cats" aria-label="Menu sections">
          {categories.map((c) => (
            <a key={c.id} href={`#c-${c.id}`}>
              {c.name}
            </a>
          ))}
        </nav>
        {categories.map((c) => (
          <section key={c.id} id={`c-${c.id}`} style={{ scrollMarginTop: 110 }}>
            <h3 style={{ fontSize: 18 }}>{c.name}</h3>
            {c.items.map((i) => {
              const q = cart[i.id] ?? 0;
              return (
                <div className="item" key={i.id}>
                  <div className="meta">
                    <b>{i.name}</b>
                    <small className="muted num">
                      {eur(i.priceCents)} · {i.station === "bar" ? "collect at bar" : "to your table"}{" "}
                      {i.soldOut && <span className="chip crit">Sold out</span>}
                    </small>
                  </div>
                  <div className="qty">
                    {q > 0 && (
                      <>
                        <button onClick={() => add(i.id, -1)} aria-label={`Remove one ${i.name}`}>
                          −
                        </button>
                        <b className="num">{q}</b>
                      </>
                    )}
                    <button onClick={() => add(i.id, 1)} aria-label={`Add one ${i.name}`} disabled={i.soldOut}>
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </section>
        ))}
        {error && !review && <div className="error">{error}</div>}
      </div>

      {count > 0 && !review && (
        <div className="cartbar">
          <div>
            <button className="btn block" onClick={() => setReview(true)}>
              Review order · {count} item{count > 1 ? "s" : ""} · {eur(gross)}
            </button>
          </div>
        </div>
      )}

      {review && !pending && (
        <div className="sheetbg" onClick={() => !busy && setReview(false)}>
          <div className="sheet" role="dialog" aria-label="Your order" onClick={(e) => e.stopPropagation()}>
            <div className="row">
              <h2 style={{ fontSize: 20 }}>{mode === "table" ? `Your order · table ${tableNumber}` : "Collect at the bar"}</h2>
              <button className="btn ghost sm" onClick={() => setReview(false)} disabled={busy}>
                Close
              </button>
            </div>
            <div style={{ maxHeight: "34vh", overflowY: "auto" }}>
              {lines.map((l) => (
                <div className="item" key={l.item.id}>
                  <div className="meta">
                    <b>
                      {l.qty} × {l.item.name}
                    </b>
                    <small className="muted">{l.item.station === "bar" ? "Collect at bar" : "Served to table"}</small>
                  </div>
                  <span className="num">{eur(l.item.priceCents * l.qty)}</span>
                  <div className="qty">
                    <button onClick={() => add(l.item.id, -1)} aria-label="Remove one">
                      −
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="sumrow muted small">
              <span>Incl. VAT 9% · 23%</span>
              <span className="num">
                {eur(vat(9))} · {eur(vat(23))}
              </span>
            </div>
            {member && member.creditCents > 0 && (
              <label className="toggle">
                <input type="checkbox" checked={useCredit} onChange={(e) => setUseCredit(e.target.checked)} /> Use credit ({eur(member.creditCents)} available)
              </label>
            )}
            {member && member.doubles > 0 && (
              <label className="toggle">
                <input type="checkbox" checked={useDouble} onChange={(e) => setUseDouble(e.target.checked)} /> Use double points ({member.doubles} left)
              </label>
            )}
            {hasAlcohol && member && !member.idChecked && (
              <div className="notice">First drinks order: bring ID when you collect (age card, passport or driving licence). Staff only need to see it once.</div>
            )}
            <div className="sumrow total">
              <span>To pay</span>
              <span className="num">{eur(toPay)}</span>
            </div>
            {member ? <div className="muted small">You&apos;ll earn {points} points.</div> : <div className="muted small">Sign in to order and earn points.</div>}
            {error && <div className="error">{error}</div>}
            <button className="btn block" onClick={placeOrder} disabled={busy || count === 0}>
              {!member ? "Sign in to order" : busy ? "Placing order…" : toPay === 0 ? "Place order with credit" : `Pay ${eur(toPay)}`}
            </button>
          </div>
        </div>
      )}

      {pending && pending.checkout.provider === "mock" && (
        <div className="sheetbg">
          <div className="sheet" role="dialog" aria-label="Payment">
            <div className="row">
              <h2 style={{ fontSize: 18 }}>Pay {eur(pending.amountCents)}</h2>
              <span className="chip warn">Test mode</span>
            </div>
            {["Apple Pay", "Google Pay", "Saved card ···· 4242"].map((m) => (
              <button key={m} className="paybtn" onClick={mockPay} disabled={busy}>
                <span>{m}</span>
                <span className="muted">›</span>
              </button>
            ))}
            <span className="muted small">No Revolut keys are set, so this stands in for the Revolut checkout widget. Paying sends a signed test webhook.</span>
            {error && <div className="error">{error}</div>}
            <button className="btn ghost sm" onClick={() => setPending(null)} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
