import { memberSummary } from "@round/db/services";
import { redirect } from "next/navigation";
import { ConvertPoints } from "@/components/ConvertPoints";
import { eur } from "@/components/format";
import { TierCard } from "@/components/TierCard";
import { currentGuest, loadVenue } from "@/lib/server";

export const dynamic = "force-dynamic";

const REASONS: Record<string, string> = { earn: "Order", redeem: "Credit used", signup: "Welcome credit", convert: "Converted", use: "Double points used", referral: "Referral bonus" };

export default async function Rewards({ params }: { params: Promise<{ slug: string }> }) {
  const venue = await loadVenue((await params).slug);
  const guest = await currentGuest();
  if (!guest) redirect(`/v/${venue.slug}/login?next=/v/${venue.slug}/rewards`);
  const s = await memberSummary(venue, guest.id);
  return (
    <div className="stack">
      <TierCard programme={s.programme.name} levels={s.levels} level={s.level} next={s.next} spend={s.spend12mCents} />
      <div className="stats3">
        <div className="stat"><b className="num">{s.balances.points.toLocaleString("en-IE")}</b><span>points</span></div>
        <div className="stat"><b className="num">{eur(s.balances.creditCents)}</b><span>credit</span></div>
        <div className="stat"><b className="num">{s.balances.doubles}</b><span>2× points</span></div>
      </div>
      <ConvertPoints slug={venue.slug} points={s.balances.points} block={s.programme.pointsPerCreditEuro} />
      <div className="card">
        <b>Refer a mate</b>
        <span className="muted small">You both get {s.programme.referralPoints} points after their first order.</span>
        <code className="num">{s.membership.referralCode}</code>
      </div>
      <div className="card">
        <b>Birthday credit</b>
        <span className="muted small">{eur(s.level.birthdayCreditCents)} credit on your birthday at your current level.</span>
      </div>
      <div className="label">Levels</div>
      <div>
        {s.levels.map((l, i) => (
          <div key={l.name} className={`lvl${l.name === s.level.name ? " cur" : ""}`}>
            <b>{i + 1}. {l.name}</b>
            <span className="muted small num">{l.minSpend12mCents ? `From ${eur(l.minSpend12mCents)} spend` : "On sign-up"}</span>
            <span />
            <span className="small">
              {eur(l.birthdayCreditCents)} birthday credit · {s.programme.pointsPerEuro} pts per €1
              {l.levelupPoints ? ` · ${l.levelupPoints.toLocaleString("en-IE")} bonus pts on level-up` : ""}
              {l.doublePointsCount ? ` · ${l.doublePointsCount} double-points orders` : ""}
            </span>
          </div>
        ))}
      </div>
      <div className="label">History</div>
      <div className="card">
        {s.history.length === 0 && <span className="muted small">Nothing yet.</span>}
        {s.history.map((h) => (
          <div className="sumrow small" key={h.id}>
            <span>{REASONS[h.reason] ?? (h.reason.startsWith("levelup") ? `Level-up: ${h.reason.split(":")[1]}` : h.reason.startsWith("refund") ? "Refund" : h.reason)}</span>
            <span className="num">
              {h.kind === "credit" ? `${h.delta > 0 ? "+" : "−"}${eur(Math.abs(h.delta))}` : `${h.delta > 0 ? "+" : ""}${h.delta} ${h.kind === "points" ? "pts" : "2×"}`}
            </span>
          </div>
        ))}
      </div>
      <form action="/api/auth/logout" method="post">
        <button className="btn ghost sm">Sign out</button>
      </form>
    </div>
  );
}
