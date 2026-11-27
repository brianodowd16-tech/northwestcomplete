import { POINT_BUNDLES_CENTS, TIERS, type Tier } from "@round/core";
import { walletSummary } from "@round/db/membership";
import { sponsorsFor } from "@round/db/sponsors";
import Link from "next/link";
import { eur } from "@/components/format";
import { MembershipBuy } from "@/components/MembershipBuy";
import { currentGuest } from "@/lib/server";

export const dynamic = "force-dynamic";

const REASON: Record<string, string> = { purchase: "Bought", purchase_bonus: "Top-up bonus", tier_monthly: "Monthly bonus", redeem: "Spent", reversal: "Put back", refund: "Refunded", adjustment: "Adjusted" };

/** Complete Gold and Platinum, and Complete Points: one wallet for every venue on Complete. */
export default async function Membership({ searchParams }: { searchParams: Promise<{ paid?: string }> }) {
  const guest = await currentGuest();
  const paid = (await searchParams).paid;
  if (!guest) return <div className="page stack" style={{ maxWidth: 560 }}><h1>Complete membership</h1><div className="notice">Open a venue and sign in first: your account works at every venue on Complete.</div><Link className="btn" href="/me">Your venues</Link></div>;
  const s = await walletSummary(guest.id);
  const tier = s.tier?.tier as Tier | undefined;
  const perks = await sponsorsFor("platinum");
  const total = s.balances.paid + s.balances.bonus;
  return (
    <div className="page stack" style={{ maxWidth: 640 }}>
      <Link href="/me" className="label" style={{ textDecoration: "none" }}>‹ Your venues</Link>
      <h1 style={{ fontSize: 28 }}>Complete membership</h1>
      {paid && <div className="notice">Thanks! Your payment is being confirmed: it shows here in a moment.</div>}
      <section className="tiercard">
        <div className="row small"><span className="label" style={{ color: "inherit", opacity: 0.85 }}>{tier ? `${TIERS[tier].name} member` : "Complete Points"}</span>{s.tier && <span>until {s.tier.endsAt.toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" })}</span>}</div>
        <h2 className="num">{total.toLocaleString("en-IE")} points</h2>
        <span className="small">= {eur(total)} to spend at any venue on Complete · {s.balances.paid.toLocaleString("en-IE")} bought (anything) · {s.balances.bonus.toLocaleString("en-IE")} bonus (food, soft drinks, songs: never alcohol)</span>
      </section>

      <section className="stack" style={{ gap: 8 }}>
        <h3>Top up points</h3>
        <div className="row wrap" style={{ justifyContent: "flex-start", gap: 8 }}>
          {POINT_BUNDLES_CENTS.map((c) => <MembershipBuy key={c} body={{ action: "points", cents: c }} label={`${eur(c)}${tier ? ` +${TIERS[tier].purchaseBonusPct}%` : ""}`} ghost />)}
        </div>
        <span className="muted small">100 points = €1. Spend them when you pay at any venue on Complete. Bought points don&apos;t expire.</span>
      </section>

      <section className="tiles2">
        {(Object.keys(TIERS) as Tier[]).map((k) => (
          <div key={k} className="card stack" style={{ gap: 6, borderColor: tier === k ? "var(--acc, #a36a1c)" : undefined }}>
            <div className="row"><b style={{ fontSize: 18 }}>{TIERS[k].name}</b>{tier === k && <span className="chip ok">Yours</span>}</div>
            <span className="num"><b>{eur(TIERS[k].monthlyCents)}</b> a month or <b>{eur(TIERS[k].annualCents)}</b> a year</span>
            <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{TIERS[k].perks.map((p) => <li key={p}>{p}</li>)}</ul>
            {!(tier === "platinum" && k === "gold") && (
              <span className="row" style={{ justifyContent: "flex-start", gap: 6 }}>
                <MembershipBuy body={{ action: "tier", tier: k, period: "monthly" }} label={tier === k ? "Add a month" : "Monthly"} />
                <MembershipBuy body={{ action: "tier", tier: k, period: "annual" }} label={tier === k ? "Add a year" : "Yearly"} ghost />
              </span>
            )}
          </div>
        ))}
      </section>

      {perks.length > 0 && (
        <section className="stack" style={{ gap: 8 }}>
          <h3>Platinum partner perks</h3>
          {perks.map((p) => (
            <a key={p.id} href={`/p/${p.slug}/go?from=platinum`} className="card" style={{ textDecoration: "none", color: "inherit" }}>
              <span className="row"><b>{p.title}</b><span className="chip plain">Sponsored</span></span>
              <span className="small">{p.platinumPerk}</span>
              {tier !== "platinum" && <span className="muted small">For Platinum members.</span>}
            </a>
          ))}
        </section>
      )}

      {s.recent.length > 0 && (
        <section className="panel">
          <h3>Points activity</h3>
          <table><tbody>{s.recent.map((r) => <tr key={r.id}><td className="small">{r.createdAt.toLocaleDateString("en-IE", { day: "numeric", month: "short" })}</td><td>{REASON[r.reason] ?? r.reason}{r.venueName ? ` · ${r.venueName}` : ""} <span className="muted small">({r.kind})</span></td><td className="r num">{r.delta > 0 ? "+" : ""}{r.delta.toLocaleString("en-IE")}</td></tr>)}</tbody></table>
        </section>
      )}
      <p className="muted small" style={{ margin: 0 }}>Memberships and points are sold by Complete, not by the venues; venues are paid for points spent with them. Membership renews only when you choose to.</p>
    </div>
  );
}
