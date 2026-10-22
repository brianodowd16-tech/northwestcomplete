import { NotFound, orderForCustomer } from "@round/db/services";
import { notFound, redirect } from "next/navigation";
import { eur } from "@/components/format";
import { LiveRefresh } from "@/components/OrderStatus";
import { currentGuest, loadVenue } from "@/lib/server";

export const dynamic = "force-dynamic";

const GUEST_TEXT = {
  bar: { new: "Received", in_progress: "Pouring", ready: "Ready at the bar", done: "Collected" },
  kitchen: { new: "Received", in_progress: "Cooking", ready: "On its way", done: "Served" },
} as const;
const STEP = { new: 0, in_progress: 1, ready: 2, done: 3 } as const;

export default async function OrderPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const venue = await loadVenue(slug);
  const guest = await currentGuest();
  if (!guest) redirect(`/v/${slug}/login?next=/v/${slug}/order/${id}`);
  const view = await orderForCustomer(venue, id, guest.id).catch((e) => {
    if (e instanceof NotFound) notFound();
    throw e;
  });
  const { order, lines, dockets } = view;
  return (
    <div className="stack">
      <LiveRefresh slug={slug} orderId={id} />
      <div>
        <div className="label">{order.channel === "table" ? `Table ${view.tableNumber}` : "Collect at the bar"}</div>
        <h1 style={{ fontSize: 28 }}>Order #{order.number}</h1>
      </div>
      {order.status === "pending_payment" && <div className="notice">Waiting for payment confirmation from Revolut…</div>}
      {order.status === "refunded" && <div className="error">This order was refunded in full.</div>}
      {dockets
        .sort((a, b) => a.station.localeCompare(b.station))
        .map((d) => (
          <div className="card" key={d.id}>
            <div className="sumrow">
              <span>{d.station === "bar" ? "Drinks" : "Food"}</span>
              <b>{GUEST_TEXT[d.station][d.status]}</b>
            </div>
            <div className="steps">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={i <= STEP[d.status] ? "on" : ""} />
              ))}
            </div>
            {d.station === "bar" && d.status === "ready" && (
              <div className="chip ok">
                Show order #{order.number} at the bar{d.idCheckRequired && !d.idCheckedAt ? " with your ID" : ""}
              </div>
            )}
          </div>
        ))}
      <div className="card">
        {lines.map((l) => (
          <div className="sumrow" key={l.id}>
            <span>
              {l.qty} × {l.name}
            </span>
            <span className="num">{eur(l.grossCents)}</span>
          </div>
        ))}
        <div className="sumrow muted small">
          <span>VAT 9% · 23%</span>
          <span className="num">
            {eur(order.vat9Cents)} · {eur(order.vat23Cents)}
          </span>
        </div>
        {order.creditUsedCents > 0 && (
          <div className="sumrow">
            <span>Credit used</span>
            <span className="num">−{eur(order.creditUsedCents)}</span>
          </div>
        )}
        <div className="sumrow total">
          <span>Paid</span>
          <span className="num">{eur(order.amountPaidCents)}</span>
        </div>
        {view.pointsEarned > 0 && <div className="chip ok">+{view.pointsEarned} points</div>}
        <span className="muted small">VAT no. {venue.vatNumber}</span>
      </div>
    </div>
  );
}
