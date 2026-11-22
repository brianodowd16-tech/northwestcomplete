"use client";
import { useState } from "react";
import { eur } from "./format";

/** Bar chart with a value tooltip on hover or tap. */
export function OfficeChart({ points, highlight }: { points: { label: string; cents: number }[]; highlight?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...points.map((p) => p.cents));
  const total = points.reduce((s, p) => s + p.cents, 0);
  const shown = hover ?? null;
  return (
    <div className="chart">
      <div className="bars" style={{ gridTemplateColumns: `repeat(${points.length}, 1fr)` }} role="img" aria-label={`Sales chart, total ${eur(total)}`} onMouseLeave={() => setHover(null)}>
        {points.map((p, i) => (
          <i
            key={i}
            className={i === highlight || i === hover ? "hl" : ""}
            style={{ height: `${(p.cents / max) * 100}%` }}
            onMouseEnter={() => setHover(i)}
            onClick={() => setHover(i === hover ? null : i)}
            title={`${p.label}: ${eur(p.cents)}`}
          />
        ))}
      </div>
      {shown !== null && (
        <span className="tip num" style={{ left: `${((shown + 0.5) / points.length) * 100}%` }}>
          {points[shown].label} · {eur(points[shown].cents)}
        </span>
      )}
      <div className="row small muted" style={{ marginTop: 6 }}>
        <span>{points[0]?.label}</span>
        <span>{points[Math.floor(points.length / 2)]?.label}</span>
        <span>{points.at(-1)?.label}</span>
      </div>
    </div>
  );
}
