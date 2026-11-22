import Link from "next/link";
import { eur } from "./format";

type Status = "new" | "in_progress" | "ready" | "done";
const TEXT = {
  bar: { new: "Received", in_progress: "Being poured", ready: "Ready at the bar", done: "Collected" },
  kitchen: { new: "Received", in_progress: "Cooking", ready: "On its way", done: "Served" },
} as const;
const STEP = { new: 0, in_progress: 1, ready: 2, done: 3 } as const;

export function ActiveOrderCard({
  slug,
  order,
  dockets,
}: {
  slug: string;
  order: { id: string; number: number; grossCents: number; channel: string };
  dockets: { station: "bar" | "kitchen"; status: Status }[];
}) {
  const ready = dockets.some((d) => d.station === "bar" && d.status === "ready");
  return (
    <Link href={`/v/${slug}/order/${order.id}`} className="card rise" style={{ textDecoration: "none", borderColor: ready ? "var(--ok)" : undefined }}>
      <div className="sumrow">
        <b>Order #{order.number}</b>
        <span className="num muted">{eur(order.grossCents)}</span>
      </div>
      {dockets
        .sort((a, b) => a.station.localeCompare(b.station))
        .map((d) => (
          <div key={d.station}>
            <div className="sumrow small">
              <span>{d.station === "bar" ? "Drinks" : "Food"}</span>
              <b style={{ color: d.status === "ready" ? "var(--ok)" : undefined }}>{TEXT[d.station][d.status]}</b>
            </div>
            <div className="steps">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={i <= STEP[d.status] ? "on" : ""} />
              ))}
            </div>
          </div>
        ))}
      {ready && <span className="chip ok">Show #{order.number} at the bar</span>}
    </Link>
  );
}
