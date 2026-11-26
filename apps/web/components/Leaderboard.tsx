import Link from "next/link";
import { LeaderboardOptIn } from "./LeaderboardOptIn";

type Board = { rows: { rank: number; tied: boolean; name: string; score: number; me: boolean }[]; me: { rank: number; score: number; listed: boolean } | null };
const ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;

/** One leaderboard. Spend boards show positions, never amounts. */
export function Leaderboard({ title, board, metric, period, base, guest }: { title: string; board: Board; metric: "points" | "spend"; period: "month" | "all"; base: string; guest: { optIn: boolean; name: string } | null }) {
  const q = (m: string, p: string) => `${base}${base.includes("?") ? "&" : "?"}metric=${m}&period=${p}`;
  return (
    <section className="panel stack">
      <div className="row wrap">
        <h3>{title}</h3>
        <div className="row wrap" style={{ gap: 6 }}>
          <nav className="seg" aria-label="Measure"><Link href={q("points", period)} aria-current={metric === "points" ? "page" : undefined}>Points</Link><Link href={q("spend", period)} aria-current={metric === "spend" ? "page" : undefined}>Top regulars</Link></nav>
          <nav className="seg" aria-label="Period"><Link href={q(metric, "month")} aria-current={period === "month" ? "page" : undefined}>This month</Link><Link href={q(metric, "all")} aria-current={period === "all" ? "page" : undefined}>All time</Link></nav>
        </div>
      </div>
      {board.rows.length === 0 ? <div className="empty">Nobody on the board yet. Opt in and order to be first.</div> : (
        <table><tbody>
          {board.rows.map((r, i) => (
            <tr key={i} style={r.me ? { fontWeight: 700 } : undefined}>
              <td className="num" style={{ width: 56 }}>{r.rank <= 3 ? ["🥇", "🥈", "🥉"][r.rank - 1] : `${r.rank}${r.tied ? "=" : ""}`}</td>
              <td>{r.name}{r.me ? " (you)" : ""}</td>
              <td className="r num">{metric === "points" ? `${r.score.toLocaleString("en-IE")} pts` : ""}</td>
            </tr>
          ))}
        </tbody></table>
      )}
      {board.me && !board.me.listed && <div className="notice small">You&apos;d be {ord(board.me.rank)} on this board. Only you can see this until you opt in.</div>}
      <span className="muted small">{metric === "spend" ? "Ranked by spend on food, soft drinks and other non-alcohol items (Irish law: no rewards or status for buying alcohol). Amounts are never shown." : "Points come from food and non-alcohol items only."} Only people who opt in are listed, under the name they choose.</span>
      {guest && <LeaderboardOptIn optIn={guest.optIn} name={guest.name} />}
    </section>
  );
}
