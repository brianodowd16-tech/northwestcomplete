import { activeOrdersForCustomer, recentOrdersForCustomer } from "@round/db/services";
import Link from "next/link";
import { redirect } from "next/navigation";
import { eur } from "@/components/format";
import { ActiveOrderCard } from "@/components/OrderCards";
import { currentGuest, loadVenue } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function Orders({ params }: { params: Promise<{ slug: string }> }) {
  const venue = await loadVenue((await params).slug);
  const guest = await currentGuest();
  if (!guest) redirect(`/v/${venue.slug}/login?next=/v/${venue.slug}/orders`);
  const [active, recent] = await Promise.all([activeOrdersForCustomer(venue, guest.id), recentOrdersForCustomer(venue, guest.id)]);
  const activeIds = new Set(active.map((a) => a.order.id));
  const past = recent.filter((o) => !activeIds.has(o.id));
  return (
    <div className="stack">
      <h1 style={{ fontSize: 26 }}>Your orders</h1>
      {active.length > 0 ? (
        active.map(({ order, dockets }) => <ActiveOrderCard key={order.id} slug={venue.slug} order={order} dockets={dockets} />)
      ) : (
        <div className="empty">Nothing on the go right now.</div>
      )}
      {past.length > 0 && <div className="label">Earlier</div>}
      {past.map((o) => (
        <Link key={o.id} href={`/v/${venue.slug}/order/${o.id}`} className="card" style={{ textDecoration: "none" }}>
          <div className="sumrow">
            <b>Order #{o.number}</b>
            <span className="num">{eur(o.grossCents)}</span>
          </div>
          <span className="muted small">
            {o.status === "refunded" ? "Refunded" : o.status === "cancelled" ? "Not paid" : new Date(o.createdAt).toLocaleString("en-IE", { dateStyle: "medium", timeStyle: "short" })}
          </span>
        </Link>
      ))}
    </div>
  );
}
