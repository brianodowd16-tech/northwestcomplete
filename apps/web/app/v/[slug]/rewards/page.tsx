import { agentActivity, guestBenefits, listGrants } from "@round/db/ai";
import { memberSummary } from "@round/db/services";
import { redirect } from "next/navigation";
import { CountUp } from "@/components/Animated";
import { PrivacyControls } from "@/components/PrivacyControls";
import { SecuritySettings } from "@/components/SecuritySettings";
import { Assistants } from "@/components/Assistants";
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
  const [s, b, grants, activity] = await Promise.all([memberSummary(venue, guest.id), guestBenefits(venue, guest.id), listGrants(venue, guest.id), agentActivity(venue, { customerId: guest.id, limit: 20 })]);
  return (
    <div className="stack">
      <TierCard programme={s.programme.name} levels={s.levels} level={s.level} next={s.next} spend={s.spend12mCents} />
      <div className="row wrap" style={{ justifyContent: "flex-start", gap: 6 }}>
        <a className="btn sm ghost" href={`/v/${venue.slug}/leaderboard`}>🏆 Leaderboard</a>
        <a className="btn sm ghost" href="/me/groups">👥 Groups and splitting</a>
      </div>
      <div className="stats3">
        <div className="stat"><b><CountUp value={s.balances.points} /></b><span>points</span></div>
        <div className="stat"><b><CountUp value={s.balances.creditCents} format="eur" /></b><span>credit</span></div>
        <div className="stat"><b className="num">{s.balances.doubles}</b><span>2× points</span></div>
      </div>
      <ConvertPoints slug={venue.slug} points={s.balances.points} block={s.programme.pointsPerCreditEuro} />
      {b.suggestions[0] && (
        <div className="card rise" style={{ background: "var(--sunk)" }}>
          <span className="label">Worth doing next</span>
          <b>{b.suggestions[0].title}</b>
          <span className="muted small">{b.suggestions[0].why}</span>
        </div>
      )}
      <section className="card" aria-label="Your benefits">
        <b>Your benefits</b>
        {b.benefits.map((x) => (
          <div key={x.id} className="benefit">
            <div>
              <div>{x.title}</div>
              <div className="muted small">{[...x.conditions, ...(x.reason && !x.available ? [x.reason] : [])].join(" · ")}</div>
            </div>
            <span className={`chip ${x.available ? "ok" : "plain"}`}>{x.available ? "Ready to use" : "Later"}</span>
          </div>
        ))}
      </section>
      <Assistants
        slug={venue.slug}
        grants={JSON.parse(JSON.stringify(grants.map(({ tokenHash: _h, ...g }) => g)))}
        activity={JSON.parse(JSON.stringify(activity.map(({ input: _i, ...a }) => a)))}
      />
      <SecuritySettings as="guest" />
      <PrivacyControls slug={venue.slug} />
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
      <form action="/api/auth/logout" method="post" style={{ marginBottom: 20 }}>
        <button className="btn ghost sm">Sign out</button>
      </form>
    </div>
  );
}
