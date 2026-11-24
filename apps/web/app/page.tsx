import { liveVenues, venueTables } from "@round/db/services";
import Link from "next/link";

export const dynamic = "force-dynamic";

const FEATURES: [string, string][] = [
  ["Order from the table", "Guests scan a QR code, order and pay on their phone. No app download needed."],
  ["Paid straight to you", "Payments go into your own myPOS account. We never hold your money."],
  ["Loyalty that brings them back", "Points, levels, birthday credit and referrals, run automatically."],
  ["Bar and kitchen screens", "Drinks to the bar, food to the kitchen, with ID checks built in."],
  ["Xero every night", "One tidy invoice a day, split by VAT rate."],
  ["Google reviews", "Every paying guest is asked to review you, the way Google allows."],
];

export default async function Home() {
  const venues = await liveVenues();
  const demo = process.env.NODE_ENV !== "production" ? await Promise.all(venues.slice(0, 4).map(async (v) => ({ v, tables: await venueTables(v) }))) : [];
  return (
    <div className="page stack" style={{ maxWidth: 980, gap: 28 }}>
      <header className="row wrap">
        <b style={{ fontFamily: "var(--f-display)", fontSize: 20 }}>Complete</b>
        <nav className="row">
          <Link className="btn sm ghost" href="/me">
            My venues
          </Link>
          <Link className="btn sm ghost" href="/staff/login">
            Venue sign in
          </Link>
          <Link className="btn sm" href="/start">
            Start free
          </Link>
        </nav>
      </header>

      <section className="landing-hero">
        <div className="stack" style={{ gap: 12 }}>
          <span className="label">For bars, hotels and restaurants</span>
          <h1>Table ordering, payments and loyalty in one app.</h1>
          <p className="muted" style={{ margin: 0, fontSize: 17 }}>
            Your own branded app for guests on iPhone, Android and the web. Set up in minutes, free for 30 days.
          </p>
          <div className="row wrap" style={{ justifyContent: "flex-start" }}>
            <Link className="btn" href="/start">
              Start your free trial
            </Link>
            <a className="btn ghost" href="#venues">
              I&apos;m a guest
            </a>
          </div>
          <span className="muted small">€99 a month after the trial, plus 1% of app payments. No card needed to start.</span>
        </div>
      </section>

      <section className="featgrid">
        {FEATURES.map(([h, p]) => (
          <div key={h} className="panel stack" style={{ gap: 6 }}>
            <b>{h}</b>
            <span className="muted small">{p}</span>
          </div>
        ))}
      </section>

      <section className="panel stack">
        <h2 style={{ fontSize: 22 }}>Live in an afternoon</h2>
        <ol className="muted" style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6 }}>
          <li>Sign up with your email and add your menu (or start from our example).</li>
          <li>Connect your myPOS account and print your table QR codes.</li>
          <li>Try an order yourself in test mode, then press Go live.</li>
        </ol>
      </section>

      <section id="venues" className="stack">
        <h2 style={{ fontSize: 22 }}>Order at a venue</h2>
        <p className="muted small" style={{ margin: 0 }}>
          At a table? Scan the QR code on it. Joining a venue&apos;s rewards is free: you need to be 18 or over.
        </p>
        {venues.length === 0 ? (
          <div className="empty">No venues yet.</div>
        ) : (
          <div className="tiles">
            {venues.map((v) => (
              <Link key={v.id} className="tile" href={`/v/${v.slug}`} style={{ borderLeft: `4px solid ${v.brandColor}` }}>
                <span style={{ minWidth: 0 }}>
                  <b>{v.name}</b>
                  <span className="muted small" style={{ display: "block" }}>
                    {v.town}
                  </span>
                </span>
                <span className="muted">›</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {demo.length > 0 && (
        <details className="panel">
          <summary style={{ cursor: "pointer" }}>
            <b>Demo shortcuts</b> <span className="muted small">(development only)</span>
          </summary>
          <div className="stack" style={{ marginTop: 10 }}>
            {demo.map(({ v, tables }) => (
              <div key={v.id} className="row wrap" style={{ justifyContent: "flex-start" }}>
                <b style={{ minWidth: 180 }}>{v.name}</b>
                {tables[0] && (
                  <Link className="btn sm" href={`/v/${v.slug}/t/${tables[0].qrToken}`}>
                    Guest at table 1
                  </Link>
                )}
                {tables[11] && (
                  <Link className="btn sm ghost" href={`/v/${v.slug}/t/${tables[11].qrToken}`}>
                    Table 12
                  </Link>
                )}
                <Link className="btn sm ghost" href={`/v/${v.slug}/collect`}>
                  Collect at bar
                </Link>
                <Link className="btn sm ghost" href={`/staff/${v.slug}/bar`}>
                  Bar screen
                </Link>
                <Link className="btn sm ghost" href={`/office/${v.slug}`}>
                  Back office
                </Link>
              </div>
            ))}
            <p className="muted small" style={{ margin: 0 }}>
              Demo staff logins: <code>staff@mjoconnors.example</code> and <code>staff@drumhierny.example</code>, password <code>round-demo</code>.
            </p>
          </div>
        </details>
      )}

      <footer className="muted small row wrap">
        <span>© Complete · Hosted in the EU</span>
        <span className="row">
          <Link href="/start">For venues</Link>
          <Link href="/staff/login">Staff sign in</Link>
        </span>
      </footer>
    </div>
  );
}
