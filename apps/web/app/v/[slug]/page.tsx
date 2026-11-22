import { activeOrdersForCustomer, memberSummary } from "@round/db/services";
import Link from "next/link";
import { eur } from "@/components/format";
import { IconGlass, IconStar, IconTable } from "@/components/Icons";
import { ActiveOrderCard } from "@/components/OrderCards";
import { currentGuest, loadVenue } from "@/lib/server";

export const dynamic = "force-dynamic";

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-IE", { hour: "numeric", hour12: false, timeZone: "Europe/Dublin" }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function VenueHome({ params }: { params: Promise<{ slug: string }> }) {
  const venue = await loadVenue((await params).slug);
  const guest = await currentGuest();
  const [summary, active] = guest ? await Promise.all([memberSummary(venue, guest.id), activeOrdersForCustomer(venue, guest.id)]) : [null, []];
  const pct = summary?.next ? Math.min(100, ((summary.spend12mCents - summary.level.minSpend12mCents) / (summary.next.minSpend12mCents - summary.level.minSpend12mCents)) * 100) : 100;
  return (
    <div className="stack">
      <section className="hero rise">
        <span className="label">{venue.town}</span>
        <h1>{guest ? `${greeting()}, ${guest.name.split(" ")[0]}` : venue.tagline}</h1>
        <span className="small" style={{ opacity: 0.85 }}>
          {guest ? "What can we get you?" : `Order from your table, skip the queue, and earn rewards at ${venue.name}.`}
        </span>
      </section>

      {active.length > 0 && (
        <section className="stack">
          <div className="label">In progress</div>
          {active.map(({ order, dockets }) => (
            <ActiveOrderCard key={order.id} slug={venue.slug} order={order} dockets={dockets} />
          ))}
        </section>
      )}

      <section className="tiles2">
        <div className="atile rise">
          <span className="ico">
            <IconTable />
          </span>
          <b>At a table?</b>
          <span className="muted small">Scan the QR code on your table. Food comes to you.</span>
        </div>
        <Link className="atile rise" href={`/v/${venue.slug}/collect`}>
          <span className="ico">
            <IconGlass />
          </span>
          <b>Collect at the bar</b>
          <span className="muted small">Order drinks now, pick up when they&apos;re ready.</span>
        </Link>
      </section>

      {summary ? (
        <Link href={`/v/${venue.slug}/rewards`} className="card rise" style={{ textDecoration: "none" }}>
          <div className="row">
            <span className="label">{summary.programme.name}</span>
            <span className="chip plain">{summary.level.name}</span>
          </div>
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
          <div className="progress" style={{ background: "var(--sunk)" }}>
            <i style={{ width: `${pct}%`, background: "var(--vacc)" }} />
          </div>
          <span className="muted small">{summary.next ? `${eur(summary.next.minSpend12mCents - summary.spend12mCents)} to ${summary.next.name}` : "You're at the top level"}</span>
        </Link>
      ) : (
        <div className="card rise">
          <div className="row">
            <b>Join for free</b>
            <span className="ico" style={{ color: "var(--vacc)" }}>
              <IconStar />
            </span>
          </div>
          <span className="muted small">Get €10 credit when you join, then earn points on every order.</span>
          <Link className="btn" href={`/v/${venue.slug}/login`}>
            Join or sign in
          </Link>
        </div>
      )}
    </div>
  );
}
