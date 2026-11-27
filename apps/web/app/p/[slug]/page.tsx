import { currentTier } from "@round/db/membership";
import { sponsorBySlug } from "@round/db/sponsors";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { currentGuest } from "@/lib/server";

export const dynamic = "force-dynamic";

/** A sponsor's page (e.g. weddings at Drumhierny): their story, the Platinum perk, and an enquiry form. */
export default async function SponsorPage({ params }: { params: Promise<{ slug: string }> }) {
  const s = await sponsorBySlug((await params).slug).catch(() => null);
  if (!s) notFound();
  const guest = await currentGuest();
  const tier = guest ? await currentTier(guest.id) : null;
  return (
    <div className="page stack" style={{ maxWidth: 620 }}>
      <Link href={guest ? "/me" : "/"} className="label" style={{ textDecoration: "none" }}>‹ Complete</Link>
      <section className="hero" style={{ background: s.brandColor }}>
        <span className="row small"><span className="label" style={{ color: "inherit", opacity: 0.85 }}>{s.title}</span><span className="chip plain">Sponsored</span></span>
        <h1>{s.headline}</h1>
        <span className="small" style={{ opacity: 0.9 }}>{s.venueName}{s.town ? `, ${s.town}` : ""} · Complete&apos;s wedding partner</span>
      </section>
      <p style={{ margin: 0 }}>{s.body}</p>
      {s.platinumPerk && (
        <div className="card">
          <span className="row"><b>Platinum perk</b>{tier?.tier === "platinum" ? <span className="chip ok">Yours</span> : <Link className="small" href="/me/membership">Become Platinum ›</Link>}</span>
          <span className="small">{s.platinumPerk}</span>
        </div>
      )}
      <ActionForm endpoint={`/api/sponsors/${s.slug}`} action="lead" className="panel stack" okText="Sent" reset>
        <h3>{s.ctaLabel}</h3>
        <div className="two">
          <label className="field">Your names<input name="name" required maxLength={80} defaultValue={guest?.name ?? ""} placeholder="Aoife & Cian" /></label>
          <label className="field">Email<input name="email" type="email" required maxLength={200} defaultValue={guest?.email ?? ""} /></label>
          <label className="field">Phone<input name="phone" type="tel" maxLength={30} /></label>
          <label className="field">Date you have in mind<input name="eventDate" type="date" /></label>
          <label className="field">Roughly how many guests<input name="guests" type="number" min={1} max={2000} /></label>
        </div>
        <label className="field">Tell them about your day<textarea name="message" rows={3} maxLength={1000} /></label>
        <label className="toggle small"><input type="checkbox" name="consent" required /> Send my details to {s.venueName} so they can contact me about this. (Complete shares nothing else.)</label>
        <button className="btn" style={{ alignSelf: "flex-start" }}>Send enquiry</button>
      </ActionForm>
      <Link className="btn ghost" href={`/v/${s.venueSlug}`}>Visit {s.venueName} on Complete</Link>
    </div>
  );
}
