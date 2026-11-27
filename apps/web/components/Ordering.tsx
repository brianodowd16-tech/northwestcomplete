"use client";

import { vatFromGross } from "@round/core/money";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { eur } from "./format";
import { IconSearch } from "./Icons";
import { toast } from "./Toasts";

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
  allergens: string[];
}

/** EU allergen names (labels for the codes stored on items). */
const ALLERGEN_LABEL: Record<string, string> = { gluten: "Gluten", crustaceans: "Crustaceans", eggs: "Eggs", fish: "Fish", peanuts: "Peanuts", soya: "Soya", milk: "Milk", nuts: "Tree nuts", celery: "Celery", mustard: "Mustard", sesame: "Sesame", sulphites: "Sulphites", lupin: "Lupin", molluscs: "Molluscs" };

interface Props {
  slug: string;
  mode: "table" | "collect";
  qrToken?: string;
  tableNumber?: number;
  categories: { id: string; name: string; items: MenuItemView[] }[];
  member: { creditCents: number; doubles: number; pointsPerEuro: number; idChecked: boolean } | null;
  /** Whether the bar and kitchen take orders right now (opening hours, staff pause), and if tips are offered. */
  service: { bar: { open: boolean; reason?: string }; kitchen: { open: boolean; reason?: string }; tips: boolean };
}
const TIP_OPTIONS = [0, 10, 12.5, 15];

type Cart = Record<string, number>;

export interface CheckoutInfo {
  provider: "mock" | "revolut" | "mypos";
  token: string | null;
  publicKey: string | null;
  mode: "sandbox" | "prod";
  /** hosted checkout (myPOS): the browser POSTs these signed fields to `action` */
  redirect: { action: string; fields: [string, string][] } | null;
}

/** Sends the guest to a hosted checkout with an auto-submitting form, as the provider requires. */
export function submitHostedCheckout(r: { action: string; fields: [string, string][] }) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = r.action;
  for (const [name, value] of r.fields) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}

export function Ordering({ slug, mode, qrToken, tableNumber, categories, member, service }: Props) {
  const router = useRouter();
  const path = usePathname();
  const storageKey = `round-cart:${slug}:${mode}`;
  const [cart, setCart] = useState<Cart>({});
  const [sheet, setSheet] = useState<"review" | "pay" | null>(null);
  const [useCredit, setUseCredit] = useState(true);
  const [wallet, setWallet] = useState<{ paid: number; bonus: number } | null>(null);
  const [useWallet, setUseWallet] = useState(false);
  useEffect(() => {
    if (!member) return;
    fetch("/api/me/membership").then((r) => (r.ok ? r.json() : null)).then((d) => d && setWallet(d.balances)).catch(() => {});
  }, [member]);
  const [useDouble, setUseDouble] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [tipPct, setTipPct] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ orderId: string; amountCents: number; checkout: CheckoutInfo } | null>(null);
  const [attemptKey, setAttemptKey] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState(categories[0]?.id ?? "");
  const [flash, setFlash] = useState<string | null>(null);
  const [bump, setBump] = useState(0);
  const chipsRef = useRef<HTMLElement>(null);
  const [recs, setRecs] = useState<{ itemId: string; reason: "your_usual" | "goes_with" | "popular"; withName: string | null }[]>([]);

  // Remember this menu (table or collect) so the Menu tab comes back here.
  useEffect(() => {
    try {
      sessionStorage.setItem(`round-last-menu:${slug}`, path);
      const raw = sessionStorage.getItem(storageKey);
      if (raw) setCart(JSON.parse(raw) as Cart);
    } catch {}
  }, [slug, path, storageKey]);

  const save = (next: Cart) => {
    setCart(next);
    setAttemptKey(null); // a changed basket is a new order
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(next));
    } catch {}
  };

  const items = useMemo(() => new Map(categories.flatMap((c) => c.items).map((i) => [i.id, i])), [categories]);
  const lines = Object.entries(cart)
    .map(([id, qty]) => ({ item: items.get(id), qty }))
    .filter((l): l is { item: MenuItemView; qty: number } => !!l.item && l.qty > 0);

  // Something in the basket just sold out (live update): take it out and say so.
  const soldOutInCart = lines.filter((l) => l.item.soldOut).map((l) => l.item.id).join(",");
  useEffect(() => {
    if (!soldOutInCart) return;
    const next = { ...cart };
    const names = soldOutInCart.split(",").map((id) => items.get(id)?.name);
    soldOutInCart.split(",").forEach((id) => delete next[id]);
    save(next);
    toast(`${names.join(", ")} just sold out and was removed`, { kind: "err" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soldOutInCart]);

  // Category bar follows the scroll position.
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActiveCat(top.target.id.slice(2));
      },
      { rootMargin: "-120px 0px -60% 0px" },
    );
    categories.forEach((c) => {
      const el = document.getElementById(`c-${c.id}`);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, [categories, query]);
  useEffect(() => {
    chipsRef.current?.querySelector<HTMLElement>(`[data-cat="${activeCat}"]`)?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [activeCat]);

  const gross = lines.reduce((s, l) => s + l.item.priceCents * l.qty, 0);
  const vat = (rate: 9 | 23) => lines.filter((l) => l.item.vatRate === rate).reduce((s, l) => s + vatFromGross(l.item.priceCents * l.qty, rate), 0);
  // Irish law: no loyalty credit or points on alcohol.
  const nonAlcohol = lines.filter((l) => !l.item.containsAlcohol).reduce((s, l) => s + l.item.priceCents * l.qty, 0);
  const credit = member && useCredit ? Math.min(member.creditCents, nonAlcohol) : 0;
  const tipCents = service.tips ? Math.floor(((gross - credit) * tipPct * 2) / 100 + 1) >> 1 : 0;
  // Complete Points: bonus points never on alcohol, bought points on anything; tips stay on the card.
  const wBonus = wallet && useWallet ? Math.min(wallet.bonus, Math.max(0, nonAlcohol - credit)) : 0;
  const wPaid = wallet && useWallet ? Math.min(wallet.paid, gross - credit - wBonus) : 0;
  const walletUsed = wBonus + wPaid;
  const toPay = gross - credit - walletUsed + tipCents;
  const points = member ? Math.floor((Math.max(0, nonAlcohol - credit - walletUsed) * member.pointsPerEuro) / 100) * (useDouble && member.doubles > 0 ? 2 : 1) : 0;
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const hasAlcohol = lines.some((l) => l.item.containsAlcohol);

  const add = (id: string, d: number) => {
    const it = categories.flatMap((c) => c.items).find((x) => x.id === id);
    if (d > 0 && it && !service[it.station].open) return toast(service[it.station].reason ?? "Not taking orders right now", { kind: "err" });
    const q = Math.max(0, Math.min(20, (cart[id] ?? 0) + d));
    const next = { ...cart, [id]: q };
    if (!q) delete next[id];
    save(next);
    if (d > 0) {
      setFlash(id);
      setBump((b) => b + 1);
      setTimeout(() => setFlash((f) => (f === id ? null : f)), 600);
      if (q === 20) toast("That's the most we can take in one order", { kind: "err" });
    }
    if (!Object.keys(next).length) setSheet(null);
  };

  // Suggestions follow the basket: your usual, what goes with it, what's popular here.
  const basketKey = Object.keys(cart).sort().join(",");
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v/${slug}/recommendations?basket=${encodeURIComponent(basketKey)}`);
        if (res.ok) setRecs((await res.json()).recommendations);
      } catch {}
    }, 250);
    return () => clearTimeout(t);
  }, [slug, basketKey]);
  const shownRecs = recs.filter((r) => items.get(r.itemId) && !items.get(r.itemId)!.soldOut && (mode === "table" || items.get(r.itemId)!.availableForCollect));
  const REASON = { your_usual: "Your usual", goes_with: "Goes with", popular: "Popular here" } as const;

  const q = query.trim().toLowerCase();
  const shown = categories
    .map((c) => ({ ...c, items: q ? c.items.filter((i) => `${i.name} ${i.description}`.toLowerCase().includes(q)) : c.items }))
    .filter((c) => c.items.length);

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
        body: JSON.stringify({ channel: mode, qrToken, lines: lines.map((l) => ({ menuItemId: l.item.id, qty: l.qty, note: notes[l.item.id] || undefined })), useCredit, useWallet, useDouble, tipCents, idempotencyKey: key }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't place the order");
      if (!data.checkout) return finish(data.orderId);
      if (data.checkout.redirect) {
        // Keep the basket until the guest comes back from the payment page.
        submitHostedCheckout(data.checkout.redirect);
        return;
      }
      setPending({ orderId: data.orderId, amountCents: data.amountCents, checkout: data.checkout });
      if (data.checkout.provider === "revolut") await payWithRevolut(data.orderId, data.checkout);
      else setSheet("pay");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function payWithRevolut(orderId: string, c: CheckoutInfo) {
    const { default: RevolutCheckout } = await import("@revolut/checkout");
    const instance = await RevolutCheckout(c.token!, c.mode);
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
      const res = await fetch("/api/dev/mock-pay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, orderId: pending.orderId }) });
      if (!res.ok) throw new Error((await res.json()).error ?? "Payment failed");
      toast("Paid. Sending it to the bar and kitchen now.", { kind: "ok" });
      finish(pending.orderId);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <div className="stack">
        <div className="row">
          <span className="modechip">
            <i /> {mode === "table" ? `Table ${tableNumber}` : "Collect at the bar"}
          </span>
          <span className="muted small">{mode === "table" ? "Food to your table · drinks at the bar" : "Drinks only"}</span>
        </div>

        <label className="search">
          <IconSearch size={18} />
          <input type="search" placeholder="Search the menu" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search the menu" />
        </label>

        {!q && (
          <nav className="cats" aria-label="Menu sections" ref={chipsRef}>
            {categories.map((c) => (
              <a key={c.id} href={`#c-${c.id}`} data-cat={c.id} aria-current={activeCat === c.id} onClick={() => setActiveCat(c.id)}>
                {c.name}
              </a>
            ))}
          </nav>
        )}

        {!q && shownRecs.length > 0 && (
          <section className="stack" style={{ gap: 8 }} aria-label="Recommended for you">
            <h3 style={{ fontSize: 16 }}>Recommended for you</h3>
            <div className="recs">
              {shownRecs.map((r) => {
                const it = items.get(r.itemId)!;
                return (
                  <button key={r.itemId} className="rec rise" onClick={() => add(it.id, 1)} aria-label={`Add ${it.name}`}>
                    <span className="stag">{REASON[r.reason]}{r.reason === "goes_with" && r.withName ? ` ${r.withName}` : ""}</span>
                    <b>{it.name}</b>
                    <span className="row">
                      <span className="num">{eur(it.priceCents)}</span>
                      <span className="plus">+</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {!service.kitchen.open && mode === "table" && <div className="notice">{service.kitchen.reason}</div>}
        {!service.bar.open && <div className="notice">{service.bar.reason}</div>}
        {shown.length === 0 && <div className="empty">Nothing matches &quot;{query}&quot;.</div>}
        {shown.map((c) => (
          <section key={c.id} id={`c-${c.id}`} style={{ scrollMarginTop: 120 }}>
            <h3 style={{ fontSize: 18 }}>{c.name}</h3>
            {c.items.map((i) => {
              const qn = cart[i.id] ?? 0;
              return (
                <div className={`item${flash === i.id ? " added" : ""}${i.soldOut ? " out" : ""}`} key={i.id}>
                  <div className="meta">
                    <b>{i.name}</b>
                    {i.description && <small className="muted">{i.description}</small>}
                    {i.allergens.length > 0 && <small className="allergens">Contains: {i.allergens.map((a) => ALLERGEN_LABEL[a] ?? a).join(", ")}</small>}
                    <div className="row" style={{ justifyContent: "flex-start", marginTop: 4 }}>
                      <span className="num" style={{ fontWeight: 600 }}>{eur(i.priceCents)}</span>
                      {i.soldOut ? <span className="chip crit">Sold out</span> : !service[i.station].open ? <span className="chip plain">Not now</span> : <span className="stag">{i.station === "bar" ? "Collect at bar" : "To your table"}</span>}
                    </div>
                  </div>
                  <div className="qty">
                    {qn > 0 && (
                      <>
                        <button onClick={() => add(i.id, -1)} aria-label={`Remove one ${i.name}`}>
                          −
                        </button>
                        <b className="num">{qn}</b>
                      </>
                    )}
                    <button className={qn ? "" : "addbtn"} onClick={() => add(i.id, 1)} aria-label={`Add one ${i.name}`} disabled={i.soldOut}>
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </section>
        ))}
        {error && !sheet && <div className="error">{error}</div>}
      </div>

      {count > 0 && !sheet && (
        <div className="cartbar">
          <div>
            <button key={bump} className="btn block bump" onClick={() => setSheet("review")} aria-label={`View order, ${count} items, ${eur(gross)}`}>
              <span className="row" style={{ gap: 10 }}>
                <span className="cartcount num">{count}</span> View order
              </span>
              <span className="num">{eur(gross)}</span>
            </button>
          </div>
        </div>
      )}

      {sheet === "review" && (
        <div className="sheetbg" onClick={() => !busy && setSheet(null)}>
          <div className="sheet" role="dialog" aria-label="Your order" onClick={(e) => e.stopPropagation()}>
            <div className="grab" />
            <div className="row">
              <h2 style={{ fontSize: 20 }}>{mode === "table" ? `Table ${tableNumber}` : "Collect at the bar"}</h2>
              <button className="btn ghost sm" onClick={() => setSheet(null)} disabled={busy}>
                Keep browsing
              </button>
            </div>
            <div style={{ maxHeight: "32vh", overflowY: "auto" }}>
              {lines.map((l) => (
                <div className="item" key={l.item.id}>
                  <div className="meta">
                    <b>{l.item.name}</b>
                    <small className="muted">{l.item.station === "bar" ? "Collect at bar" : "Served to table"}</small>
                    <input
                      className="note-in"
                      value={notes[l.item.id] ?? ""}
                      onChange={(e) => setNotes((n) => ({ ...n, [l.item.id]: e.target.value.slice(0, 140) }))}
                      placeholder={l.item.station === "kitchen" ? "Add a note (allergy, no onions…)" : "Add a note (no ice…)"}
                      aria-label={`Note for ${l.item.name}`}
                    />
                  </div>
                  <div className="qty">
                    <button onClick={() => add(l.item.id, -1)} aria-label={`Remove one ${l.item.name}`}>
                      −
                    </button>
                    <b className="num">{l.qty}</b>
                    <button onClick={() => add(l.item.id, 1)} aria-label={`Add one ${l.item.name}`}>
                      +
                    </button>
                  </div>
                  <span className="num" style={{ minWidth: 64, textAlign: "right" }}>
                    {eur(l.item.priceCents * l.qty)}
                  </span>
                </div>
              ))}
            </div>
            {member && member.creditCents > 0 && (
              <label className="switch">
                <span>
                  Use my credit <span className="muted small">({eur(member.creditCents)})</span>
                </span>
                <input type="checkbox" checked={useCredit} onChange={(e) => setUseCredit(e.target.checked)} />
              </label>
            )}
            {wallet && wallet.paid + wallet.bonus > 0 && (
              <label className="switch">
                <span>
                  Pay with Complete Points <span className="muted small">({eur(wallet.paid + wallet.bonus)}{hasAlcohol && wallet.bonus ? "; bonus points not on alcohol" : ""})</span>
                </span>
                <input type="checkbox" checked={useWallet} onChange={(e) => setUseWallet(e.target.checked)} />
              </label>
            )}
            {member && member.doubles > 0 && (
              <label className="switch">
                <span>
                  Double points <span className="muted small">({member.doubles} left)</span>
                </span>
                <input type="checkbox" checked={useDouble} onChange={(e) => setUseDouble(e.target.checked)} />
              </label>
            )}
            {service.tips && gross - credit > 0 && (
              <div className="stack" style={{ gap: 6 }}>
                <span className="small">Add a tip? <span className="muted">All of it goes to the staff.</span></span>
                <div className="tipchips">
                  {TIP_OPTIONS.map((p) => (
                    <button key={p} className={tipPct === p ? "on" : ""} onClick={() => setTipPct(p)} type="button">
                      {p === 0 ? "No tip" : `${p}%`}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {lines.some((l) => l.item.allergens.length) && <div className="muted small">Allergy? Tell us in a note and ask staff before you eat. Allergens are listed on each item.</div>}
            {hasAlcohol && member && !member.idChecked && <div className="notice">First drinks order: show ID when you collect (age card, passport or licence). Only once.</div>}
            <div className="stack" style={{ gap: 4 }}>
              <div className="sumrow muted small">
                <span>Subtotal (VAT 9% {eur(vat(9))} · 23% {eur(vat(23))})</span>
                <span className="num">{eur(gross)}</span>
              </div>
              {credit > 0 && (
                <div className="sumrow small">
                  <span>Credit</span>
                  <span className="num">−{eur(credit)}</span>
                </div>
              )}
              {walletUsed > 0 && (
                <div className="sumrow small">
                  <span>Complete Points</span>
                  <span className="num">−{eur(walletUsed)}</span>
                </div>
              )}
              {tipCents > 0 && (
                <div className="sumrow small">
                  <span>Tip for the staff</span>
                  <span className="num">{eur(tipCents)}</span>
                </div>
              )}
              <div className="sumrow total">
                <span>To pay</span>
                <span className="num">{eur(toPay)}</span>
              </div>
            </div>
            {member && hasAlcohol && <div className="muted small">Points and credit don&apos;t apply to alcohol: Irish law doesn&apos;t allow loyalty rewards on it.</div>}
            {member ? <div className="chip ok" style={{ alignSelf: "flex-start" }}>You&apos;ll earn {points} points</div> : <div className="muted small">Sign in to order and earn points. Your basket is kept.</div>}
            {error && <div className="error">{error}</div>}
            <button className="btn block" onClick={placeOrder} disabled={busy || count === 0} style={{ padding: 15 }}>
              {!member ? "Sign in to order" : busy ? "Placing order…" : toPay === 0 ? (walletUsed ? "Place order with points" : "Place order with credit") : `Pay ${eur(toPay)}`}
            </button>
          </div>
        </div>
      )}

      {sheet === "pay" && pending && pending.checkout.provider === "mock" && (
        <div className="sheetbg">
          <div className="sheet" role="dialog" aria-label="Payment">
            <div className="grab" />
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
            <span className="muted small">This venue is on test payments, so no money moves. Paying sends a signed test notification through the real payment path.</span>
            {error && <div className="error">{error}</div>}
            <button
              className="btn ghost sm"
              onClick={() => {
                setPending(null);
                setSheet("review");
                toast("Payment cancelled. Nothing was charged.");
              }}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
