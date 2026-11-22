"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { eur } from "./format";
import { IconSearch } from "./Icons";
import { toast } from "./Toasts";
import { useLive } from "./useLive";

interface Item {
  id: string;
  name: string;
  priceCents: number;
  station: string;
  soldOut: boolean;
}

export function SoldOutBoard({ slug, categories }: { slug: string; categories: { id: string; name: string; items: Item[] }[] }) {
  const router = useRouter();
  const [out, setOut] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState("");
  useLive(slug, () => router.refresh());
  useEffect(() => setOut(Object.fromEntries(categories.flatMap((c) => c.items.map((i) => [i.id, i.soldOut])))), [categories]);

  async function set(item: Item, soldOut: boolean, quiet = false) {
    setOut((o) => ({ ...o, [item.id]: soldOut })); // instant on screen
    const res = await fetch(`/api/staff/items/${item.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ soldOut }) });
    if (!res.ok) {
      setOut((o) => ({ ...o, [item.id]: !soldOut }));
      toast("Couldn't save. Try again.", { kind: "err" });
      return;
    }
    if (!quiet) toast(soldOut ? `${item.name} is off the menu` : `${item.name} is back on`, { kind: soldOut ? "info" : "ok", action: { label: "Undo", run: () => set(item, !soldOut, true) } });
  }

  const query = q.trim().toLowerCase();
  const outCount = Object.values(out).filter(Boolean).length;
  return (
    <div className="stack">
      <div className="row wrap">
        <p className="muted" style={{ margin: 0 }}>Tap an item to take it off every guest&apos;s menu straight away.</p>
        <span className={`chip ${outCount ? "crit" : "ok"}`}>{outCount ? `${outCount} sold out` : "Everything available"}</span>
      </div>
      <label className="search" style={{ maxWidth: 420 }}>
        <IconSearch size={18} />
        <input type="search" placeholder="Find an item" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find an item" />
      </label>
      {categories.map((c) => {
        const items = c.items.filter((i) => !query || i.name.toLowerCase().includes(query));
        if (!items.length) return null;
        return (
          <section key={c.id} className="stack" style={{ gap: 8 }}>
            <h3 style={{ fontSize: 16 }}>{c.name}</h3>
            <div className="tiles">
              {items.map((i) => (
                <button key={i.id} className={`tile${out[i.id] ? " out" : ""}`} style={{ cursor: "pointer", textAlign: "left" }} onClick={() => set(i, !out[i.id])} aria-pressed={!!out[i.id]}>
                  <div style={{ minWidth: 0 }}>
                    <b>{i.name}</b>
                    <div className="muted small num">
                      {eur(i.priceCents)} · {i.station}
                    </div>
                  </div>
                  <span className={`chip ${out[i.id] ? "crit" : "ok"}`}>{out[i.id] ? "Sold out" : "On"}</span>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
