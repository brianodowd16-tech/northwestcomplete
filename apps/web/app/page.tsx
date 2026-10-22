import { allVenues, venueTables } from "@round/db/services";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Home() {
  const venues = await allVenues();
  const withTables = await Promise.all(venues.map(async (v) => ({ v, tables: await venueTables(v) })));
  return (
    <div className="page stack" style={{ maxWidth: 760 }}>
      <div>
        <div className="label">Round · prototype</div>
        <h1 style={{ fontSize: 32 }}>Venues</h1>
      </div>
      {withTables.map(({ v, tables }) => (
        <section key={v.id} className="panel stack">
          <div>
            <h2 style={{ fontSize: 22 }}>{v.name}</h2>
            <span className="muted small">{v.tagline}</span>
          </div>
          <div className="row wrap" style={{ justifyContent: "flex-start" }}>
            <Link className="btn sm" href={`/v/${v.slug}/t/${tables[0].qrToken}`}>Guest at table 1</Link>
            <Link className="btn sm ghost" href={`/v/${v.slug}/t/${tables[11].qrToken}`}>Table 12</Link>
            <Link className="btn sm ghost" href={`/v/${v.slug}/collect`}>Collect at bar</Link>
            <Link className="btn sm ghost" href={`/staff/${v.slug}/bar`}>Bar screen</Link>
            <Link className="btn sm ghost" href={`/staff/${v.slug}/kitchen`}>Kitchen screen</Link>
            <Link className="btn sm ghost" href={`/office/${v.slug}`}>Back office</Link>
          </div>
        </section>
      ))}
      <p className="muted small">
        Demo staff logins: <code>staff@mjoconnors.example</code> and <code>staff@drumhierny.example</code>, password <code>round-demo</code>. Payments are simulated until Revolut sandbox keys are set in <code>.env</code>.
      </p>
    </div>
  );
}
