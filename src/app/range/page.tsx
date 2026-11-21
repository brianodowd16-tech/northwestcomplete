import type { Metadata } from "next";
import Link from "next/link";
import { RANGE_CATEGORIES } from "@/lib/content";

export const metadata: Metadata = {
  title: "Our Range",
  description: "Stoves, fireplaces, pellet, gas, electric and oil fires, beams, accessories and outdoor living, all on display in Carrick-on-Shannon.",
};

export default function RangeIndex() {
  return (
    <div className="wrap" style={{ paddingBottom: 96 }}>
      <header className="page-head">
        <p className="eyebrow">Our range</p>
        <h1>Over 80 fires on live display</h1>
        <p className="lead">Browse the makers and models we carry, then visit the showroom to see them burning. Every fire is specified with expert advice on output, flues, hearths and fitting.</p>
      </header>
      <div className="tiles">
        {RANGE_CATEGORIES.map((c) => (
          <Link key={c.slug} href={`/range/${c.slug}`} className="tile">
            <div>
              <h3>{c.name}</h3>
              <p>{c.blurb}</p>
            </div>
            <span>Browse →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
