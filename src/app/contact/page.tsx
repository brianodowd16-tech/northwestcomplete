import type { Metadata } from "next";
import Link from "next/link";
import { ContactForm } from "@/components/ContactForm";
import { Icon } from "@/components/Icon";
import { STORE } from "@/lib/config";

export const metadata: Metadata = {
  title: "Visit the Showroom",
  description: "Visit O'Dowd's Fireplaces & Stoves on Station Road, Carrick-on-Shannon, Co. Roscommon N41 DW99, or send the team a message.",
};

export default function ContactPage() {
  const a = STORE.address;
  return (
    <div className="wrap">
      <header className="page-head">
        <p className="eyebrow">Visit us</p>
        <h1>Come and see it <span className="accent">burning</span></h1>
        <p className="lead">The best way to choose a fire is in person. Visit the showroom, start an online consultation, or send the team a message below.</p>
      </header>
      <div className="contact-grid">
        <div className="panel">
          <dl className="dl">
            <div><dt>Showroom</dt><dd><address>{STORE.name}<br />{a.street}<br />{a.town}<br />{a.county} {a.eircode}</address></dd></div>
            <div><dt>Email</dt><dd><a className="link" href={`mailto:${STORE.email}`}>{STORE.email}</a></dd></div>
          </dl>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 28 }}>
            <a className="btn btn--dark" href={STORE.mapUrl} target="_blank" rel="noopener">Get directions <Icon name="arrow" size={16} /></a>
            <Link className="btn btn--outline" href="/#consultation">Start a consultation</Link>
          </div>
        </div>
        <div className="panel">
          <h2>Send us a message</h2>
          <ContactForm email={STORE.email} />
        </div>
      </div>
    </div>
  );
}
