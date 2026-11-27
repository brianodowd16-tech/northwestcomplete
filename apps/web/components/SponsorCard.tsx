import { countSponsor, sponsorsFor, type Placement } from "@round/db/sponsors";

/** A sponsor's card for one placement, always labelled. Counts an anonymous view. */
export async function SponsorCard({ placement }: { placement: Placement }) {
  const list = await sponsorsFor(placement).catch(() => []);
  const s = list[0];
  if (!s) return null;
  void countSponsor(s.id, placement, "impressions").catch(() => {});
  return (
    <a href={`/p/${s.slug}/go?from=${placement}`} className="card" style={{ textDecoration: "none", color: "inherit", borderLeft: `4px solid ${s.brandColor}` }}>
      <span className="row"><span className="label">{s.title}</span><span className="chip plain">Sponsored</span></span>
      <b style={{ fontSize: 17 }}>{s.headline}</b>
      <span className="muted small">{s.body}</span>
      <span className="small" style={{ fontWeight: 600, color: s.brandColor }}>{s.ctaLabel} ›</span>
    </a>
  );
}
