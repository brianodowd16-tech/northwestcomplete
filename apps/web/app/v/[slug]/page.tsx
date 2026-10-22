import { memberSummary, recentOrdersForCustomer } from "@round/db/services";
import Link from "next/link";
import { eur } from "@/components/format";
import { TierCard } from "@/components/TierCard";
import { currentGuest, loadVenue } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function VenueHome({ params }: { params: Promise<{ slug: string }> }) {
  const venue = await loadVenue((await params).slug);
  const guest = await currentGuest();
  const summary = guest ? await memberSummary(venue, guest.id) : null;
  const orders = guest ? await recentOrdersForCustomer(venue, guest.id) : [];
  return (
    <div className="stack">
      <div>
        <div className="label">{venue.town}</div>
        <h1 style={{ fontSize: 28 }}>{guest ? `Hi ${guest.name.split(" ")[0]}` : venue.tagline}</h1>
      </div>
      {summary && (
        <>
          <TierCard programme={summary.programme.name} levels={summary.levels} level={summary.level} next={summary.next} spend={summary.spend12mCents} />
          <div className="stats3">
            <div className="stat">
              <b className="num">{summary.balances.points.toLocaleString("en-IE")}</b>
              <span>points</span>
            </div>
            <div className="stat">
              <b className="num">{eur(summary.balances.creditCents)}</b>
              <span>credit</span>
            </div>
            <div className="stat">
              <b className="num">{summary.balances.doubles}</b>
              <span>2× points</span>
            </div>
          </div>
        </>
      )}
      <div className="card">
        <b>At a table?</b>
        <span className="muted small">Scan the QR code on your table to order. Food comes to you; drinks are collected at the bar.</span>
      </div>
      <Link className="btn block" href={`/v/${venue.slug}/collect`}>
        Order drinks to collect at the bar
      </Link>
      {!guest && (
        <Link className="btn ghost block" href={`/v/${venue.slug}/login`}>
          Sign in or join to earn points
        </Link>
      )}
      {orders.length > 0 && (
        <>
          <div className="label">Your recent orders</div>
          {orders.map((o) => (
            <Link key={o.id} className="card" href={`/v/${venue.slug}/order/${o.id}`}>
              <div className="sumrow">
                <b>Order #{o.number}</b>
                <span className="num">{eur(o.grossCents)}</span>
              </div>
              <span className="muted small">{o.status === "refunded" ? "Refunded" : new Date(o.createdAt).toLocaleString("en-IE", { dateStyle: "medium", timeStyle: "short" })}</span>
            </Link>
          ))}
        </>
      )}
    </div>
  );
}
