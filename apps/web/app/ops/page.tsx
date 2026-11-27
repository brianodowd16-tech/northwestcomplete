import { allSponsorships, sponsorReport } from "@round/db/sponsors";
import { opsOverview } from "@round/db/platform";
import { networkPosts } from "@round/db/social";
import { OpsPostButton } from "@/components/OpsPostButton";
import { eur } from "@/components/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Complete ops", robots: { index: false } };

const ago = (d: Date | null) => {
  if (!d) return "never";
  const h = Math.round((Date.now() - new Date(d).getTime()) / 3_600_000);
  return h < 1 ? "just now" : h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
};

/** Every venue at a glance for Complete's own team (protected by middleware.ts). */
export default async function Ops() {
  const o = await opsOverview();
  const spons = await Promise.all((await allSponsorships()).map(async (x) => ({ ...x, rows: await sponsorReport(x.s.id) })));
  const net = await networkPosts();
  const live = o.venues.filter((v) => v.status === "live");
  const setup = o.venues.filter((v) => v.status === "setup");
  const mrr = live.reduce((s, v) => s + v.monthlyFeeCents, 0);
  const gmv = o.venues.reduce((s, v) => s + v.paid30dCents, 0);
  return (
    <div className="page stack" style={{ maxWidth: 1200 }}>
      <div>
        <div className="label">Complete</div>
        <h1 style={{ fontSize: 28 }}>Operations</h1>
      </div>
      <div className="row wrap" style={{ gap: 12 }}>
        {[
          ["Live venues", String(live.length)],
          ["In set-up", String(setup.length)],
          ["Subscriptions / month", eur(mrr)],
          ["App and till payments, 30 days", eur(gmv)],
          ["Open venue alerts", String(o.venues.reduce((s, v) => s + v.openAlerts, 0))],
          ["Emails failed / waiting", `${o.outbox.failed ?? 0} / ${o.outbox.pending ?? 0}`],
        ].map(([k, v]) => (
          <div key={k} className="panel" style={{ flex: "1 1 160px" }}>
            <div className="muted small">{k}</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{v}</div>
          </div>
        ))}
      </div>
      <section className="panel stack">
        <h3>Venues</h3>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead><tr><th>Venue</th><th>Status</th><th>Signed up</th><th className="r">Orders 30d</th><th className="r">Paid 30d</th><th>Last order</th><th className="r">Alerts</th><th>Last invoice</th></tr></thead>
            <tbody>
              {o.venues.map((v) => (
                <tr key={v.id}>
                  <td>{v.name}<div className="muted small">{v.town} · {v.kind} · {v.slug}</div></td>
                  <td><span className={`chip ${v.status === "live" ? "ok" : v.status === "suspended" ? "warn" : "plain"}`}>{v.status}</span></td>
                  <td className="small">{ago(v.createdAt)}</td>
                  <td className="r num">{v.orders30d}</td>
                  <td className="r num">{eur(v.paid30dCents)}</td>
                  <td className="small">{ago(v.lastOrderAt)}</td>
                  <td className="r">{v.openAlerts ? <span className="chip warn">{v.openAlerts}</span> : "0"}</td>
                  <td className="small">{v.lastInvoice ? `${v.lastInvoice.period} · ${eur(v.lastInvoice.totalCents)} · ${v.lastInvoice.status}` : "none yet"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel stack">
        <h3>Network posts (Complete&apos;s own accounts)</h3>
        {net.length === 0 ? <div className="empty">None yet. Set NETWORK_META_PAGE_ID and NETWORK_META_PAGE_TOKEN, and venues opt in from Social → Community.</div> : (
          <table><tbody>{net.map((p) => (
            <tr key={p.id}>
              <td className="small" style={{ whiteSpace: "pre-wrap" }}>{p.text.slice(0, 220)}{p.text.length > 220 ? "…" : ""}</td>
              <td className="small">{p.scheduledFor.toLocaleString("en-IE", { timeZone: "Europe/Dublin", weekday: "short", hour: "2-digit", minute: "2-digit" })}</td>
              <td className="r">{p.status === "draft" ? <OpsPostButton id={p.id} /> : <span className="chip plain">{p.status}</span>}</td>
            </tr>
          ))}</tbody></table>
        )}
      </section>
      <section className="panel stack">
        <h3>Sponsorships</h3>
        {spons.length === 0 ? <div className="empty">None.</div> : (
          <table><tbody>{spons.map(({ s, venueName, rows }) => (
            <tr key={s.id}>
              <td><b>{s.title}</b> <span className="muted small">{venueName} · {s.placements.join(", ")} · until {s.endsAt.toLocaleDateString("en-IE")}</span></td>
              <td className="small num">{rows.reduce((a, r) => a + r.impressions, 0)} views · {rows.reduce((a, r) => a + r.clicks, 0)} clicks · {rows.reduce((a, r) => a + r.leads, 0)} enquiries (30 days)</td>
              <td className="r"><span className={`chip ${s.active ? "ok" : "plain"}`}>{s.active ? "Live" : "Paused"}</span></td>
            </tr>
          ))}</tbody></table>
        )}
      </section>
      <div className="two">
        <section className="panel stack">
          <h3>Server errors</h3>
          {o.errors.length === 0 ? <div className="empty">None recorded.</div> : (
            <table><tbody>{o.errors.map((e) => <tr key={e.fingerprint}><td className="small">{e.message}<div className="muted small">{e.context}</div></td><td className="r num">{e.count}×</td><td className="small">{ago(e.lastAt)}</td></tr>)}</tbody></table>
          )}
        </section>
        <section className="panel stack">
          <h3>Emails that failed</h3>
          {o.failedEmails.length === 0 ? <div className="empty">None.</div> : (
            <table><tbody>{o.failedEmails.map((e) => <tr key={e.id}><td className="small">{e.subject}<div className="muted small">{e.to} · {e.lastError}</div></td><td className="small">{ago(e.createdAt)}</td></tr>)}</tbody></table>
          )}
        </section>
      </div>
    </div>
  );
}
