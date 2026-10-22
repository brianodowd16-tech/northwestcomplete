"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { eur } from "./format";

export function ConvertPoints({ slug, points, block }: { slug: string; points: number; block: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amount = Math.floor(points / block) * block;
  if (amount === 0) return <p className="muted small" style={{ margin: 0 }}>Collect {block} points to turn them into {eur(100)} credit.</p>;
  return (
    <>
      <button
        className="btn ghost block"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const res = await fetch(`/api/v/${slug}/convert`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ points: amount }) });
          if (!res.ok) setError((await res.json()).error);
          setBusy(false);
          router.refresh();
        }}
      >
        Convert {amount.toLocaleString("en-IE")} points to {eur((amount / block) * 100)} credit
      </button>
      {error && <div className="error">{error}</div>}
    </>
  );
}
