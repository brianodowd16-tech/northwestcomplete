import { eur } from "./format";

interface Level {
  name: string;
  minSpend12mCents: number;
}

export function TierCard({ programme, levels, level, next, spend }: { programme: string; levels: Level[]; level: Level; next: Level | null; spend: number }) {
  const idx = levels.findIndex((l) => l.name === level.name);
  const pct = next ? Math.min(100, ((spend - level.minSpend12mCents) / (next.minSpend12mCents - level.minSpend12mCents)) * 100) : 100;
  return (
    <div className="tiercard">
      <div className="row small">
        <span className="label" style={{ color: "inherit", opacity: 0.85 }}>
          {programme}
        </span>
        <span>
          Level {idx + 1} of {levels.length}
        </span>
      </div>
      <h2>{level.name}</h2>
      <div className="progress">
        <i style={{ width: `${pct}%` }} />
      </div>
      <div className="row small">
        <span className="num">{eur(spend)} spent (12 months)</span>
        <span>{next ? `${eur(next.minSpend12mCents - spend)} to ${next.name}` : "Top level"}</span>
      </div>
    </div>
  );
}
