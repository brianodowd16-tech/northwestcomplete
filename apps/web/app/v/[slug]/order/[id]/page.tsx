import { NotFound, orderForCustomer } from "@round/db/services";
import { notFound, redirect } from "next/navigation";
import { eur } from "@/components/format";
import { IconBell, IconCheck, IconFlame, IconGlass } from "@/components/Icons";
import { ApproveOrder } from "@/components/ApproveOrder";
import { OrderAlerts } from "@/components/OrderStatus";
import { currentGuest, loadVenue } from "@/lib/server";

export const dynamic = "force-dynamic";

const STEPS = {
  bar: ["Order received", "Being poured", "Ready at the bar", "Collected"],
  kitchen: ["Order received", "Cooking", "On its way to you", "Served"],
} as const;
const STEP = { new: 0, in_progress: 1, ready: 2, done: 3 } as const;
const time = (d: Date | null) => (d ? new Date(d).toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Dublin" }) : "");

export default async function OrderPage({ params, searchParams }: { params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ cancelled?: string }> }) {
  const { slug, id } = await params;
  const cancelled = (await searchParams).cancelled === "1";
  const venue = await loadVenue(slug);
  const guest = await currentGuest();
  if (!guest) redirect(`/v/${slug}/login?next=/v/${slug}/order/${id}`);
  const view = await orderForCustomer(venue, id, guest.id).catch((e) => {
    if (e instanceof NotFound) notFound();
    throw e;
  });
  const { order, lines, dockets } = view;
  const bar = dockets.find((d) => d.station === "bar");
  const kitchen = dockets.find((d) => d.station === "kitchen");

  const heldForApproval = order.status === "pending_payment" && !order.providerOrderId && order.idempotencyKey.startsWith("agent:");
  let hero: { cls: string; icon: React.ReactNode; title: string; sub: string };
  if (order.status === "refunded") hero = { cls: "", icon: <IconCheck />, title: "Refunded", sub: "This order was refunded in full to your card." };
  else if (order.status === "cancelled") hero = { cls: "", icon: <IconCheck />, title: "Not paid", sub: "This order wasn't paid, so it was cancelled." };
  else if (heldForApproval) hero = { cls: "", icon: <IconBell />, title: "Waiting for your approval", sub: "Prepared by your AI assistant." };
  else if (order.status === "pending_payment") hero = cancelled ? { cls: "", icon: <IconCheck />, title: "Payment cancelled", sub: "Nothing was charged." } : { cls: "", icon: <IconBell />, title: "Confirming payment…", sub: "This takes a few seconds." };
  else if (bar?.status === "ready") hero = { cls: "ready", icon: <IconGlass />, title: "Your drinks are ready", sub: `Show order #${order.number} at the bar${bar.idCheckRequired && !bar.idCheckedAt ? " with your ID" : ""}.` };
  else if (kitchen?.status === "ready") hero = { cls: "ready", icon: <IconFlame />, title: "Your food is on its way", sub: `To table ${view.tableNumber}.` };
  else if (dockets.length && dockets.every((d) => d.status === "done")) hero = { cls: "", icon: <IconCheck />, title: "All done", sub: "Enjoy! Thanks for ordering." };
  else if (dockets.some((d) => d.status === "in_progress")) hero = { cls: "", icon: <IconFlame />, title: "We're on it", sub: "We'll tell you the moment it's ready. Keep this page open." };
  else hero = { cls: "", icon: <IconCheck />, title: "Order received", sub: "The team will start on it shortly." };

  return (
    <div className="stack">
      <OrderAlerts slug={slug} paid={order.status === "paid"} dockets={dockets.map((d) => ({ station: d.station, status: d.status }))} />
      <div className="row">
        <h1 style={{ fontSize: 26 }}>Order #{order.number}</h1>
        <span className="modechip">
          <i /> {order.channel === "table" ? `Table ${view.tableNumber}` : "Collect at bar"}
        </span>
      </div>

      <section className={`statushero rise ${hero.cls}`} aria-live="polite">
        <span className="dot">{hero.icon}</span>
        <div>
          <b style={{ fontSize: 18 }}>{hero.title}</b>
          <div className="muted small">{hero.sub}</div>
        </div>
      </section>
      {heldForApproval && <ApproveOrder slug={slug} orderId={order.id} amountCents={order.amountPaidCents} />}
      {order.status === "pending_payment" && cancelled && (
        <a className="btn ghost" href={`/v/${slug}/${order.channel === "collect" ? "collect" : ""}`}>
          Back to the menu
        </a>
      )}

      {order.status === "paid" &&
        [bar, kitchen].filter(Boolean).map((d) => {
          const station = d!.station;
          const at = [d!.createdAt, d!.startedAt, d!.readyAt, d!.doneAt];
          return (
            <section key={station} className="card rise">
              <b>{station === "bar" ? "Drinks" : "Food"}</b>
              <ol className="tl">
                {STEPS[station].map((label, i) => {
                  const cur = STEP[d!.status];
                  const finished = i < cur || d!.status === "done";
                  return (
                  <li key={label} className={finished ? "done" : i === cur ? "now" : ""}>
                    <span className="b">{finished ? "✓" : ""}</span>
                    <span>{label}</span>
                    <span className="muted small num">{time(at[i])}</span>
                  </li>
                  );
                })}
              </ol>
            </section>
          );
        })}

      <details className="card">
        <summary className="sumrow" style={{ cursor: "pointer", listStyle: "none" }}>
          <b>Receipt</b>
          <span className="num">{eur(order.amountPaidCents)} paid</span>
        </summary>
        <div className="stack" style={{ gap: 6, marginTop: 8 }}>
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
          <span className="muted small">VAT no. {venue.vatNumber}</span>
        </div>
      </details>
      {view.pointsEarned > 0 && order.status === "paid" && <div className="chip ok" style={{ alignSelf: "flex-start" }}>+{view.pointsEarned} points earned</div>}

      {order.status === "paid" && venue.googlePlaceId && (
        // Same prompt for every guest, nothing given in return: Google bans review incentives and gating.
        <div className="card">
          <b>Enjoying {venue.name}?</b>
          <span className="muted small">A quick Google review helps other people find us.</span>
          <a className="btn ghost" href={`/api/v/${slug}/review/${order.id}`} target="_blank" rel="noopener">
            Leave a Google review
          </a>
        </div>
      )}
    </div>
  );
}
