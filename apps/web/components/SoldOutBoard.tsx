"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { eur } from "./format";
import { useLive } from "./useLive";

export function SoldOutBoard({ slug, items }: { slug: string; items: { id: string; name: string; priceCents: number; station: string; soldOut: boolean }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  useLive(slug, () => router.refresh());
  return (
    <div className="tiles">
      {items.map((i) => (
        <div key={i.id} className={`tile${i.soldOut ? " out" : ""}`}>
          <div>
            <b>{i.name}</b>
            <div className="muted small num">
              {eur(i.priceCents)} · {i.station}
            </div>
          </div>
          <button
            className={`btn sm ${i.soldOut ? "" : "ghost"}`}
            disabled={busy === i.id}
            onClick={async () => {
              setBusy(i.id);
              await fetch(`/api/staff/items/${i.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ soldOut: !i.soldOut }) });
              setBusy(null);
              router.refresh();
            }}
          >
            {i.soldOut ? "Back on" : "Sold out"}
          </button>
        </div>
      ))}
    </div>
  );
}
