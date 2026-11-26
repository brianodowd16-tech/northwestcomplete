import { IRISH_COUNTIES } from "@round/core";
import { leaderboard, liveCounties } from "@round/db/groups";
import Link from "next/link";
import { Leaderboard } from "@/components/Leaderboard";
import { currentGuest } from "@/lib/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Leaderboards · Complete" };

/** County and country leaderboards across every venue on Complete. */
export default async function Leaderboards({ searchParams }: { searchParams: Promise<{ county?: string; country?: string; metric?: string; period?: string }> }) {
  const sp = await searchParams;
  const metric = sp.metric === "spend" ? "spend" : "points", period = sp.period === "all" ? "all" : "month";
  const county = sp.county && (IRISH_COUNTIES as readonly string[]).includes(sp.county) ? sp.county : null;
  const country = !county ? (sp.country && /^[A-Z]{2}$/.test(sp.country) ? sp.country : "IE") : null;
  const guest = await currentGuest();
  const board = await leaderboard(county ? { kind: "county", county } : { kind: "country", country: country! }, metric, period, guest?.id);
  const counties = await liveCounties();
  return (
    <div className="page stack" style={{ maxWidth: 640 }}>
      <Link href="/me" className="label" style={{ textDecoration: "none" }}>Complete</Link>
      <h1 style={{ fontSize: 28 }}>Leaderboards</h1>
      <nav className="seg" aria-label="Where" style={{ flexWrap: "wrap" }}>
        <Link href="/leaderboards?country=IE" aria-current={country === "IE" ? "page" : undefined}>Ireland</Link>
        {counties.map((c) => <Link key={c.county} href={`/leaderboards?county=${encodeURIComponent(c.county)}`} aria-current={county === c.county ? "page" : undefined}>{c.county}</Link>)}
      </nav>
      <Leaderboard title={county ? `Co. ${county}` : "Ireland"} board={board} metric={metric} period={period} base={county ? `/leaderboards?county=${encodeURIComponent(county)}` : `/leaderboards?country=${country}`} guest={guest ? { optIn: guest.leaderboardOptIn, name: guest.leaderboardName ?? guest.name.split(" ")[0] } : null} />
    </div>
  );
}
