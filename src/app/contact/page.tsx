import type { Metadata } from "next";
import { STORE } from "@/lib/config";

export const metadata: Metadata = {
  title: "Contact & Directions",
  description: "Visit O'Dowd's Fireplaces & Stoves on Station Road, Carrick-on-Shannon, Co. Roscommon N41 DW99. Call 071 96 20153.",
};

export default function ContactPage() {
  const a = STORE.address;
  return (
    <div className="wrap" style={{ paddingBottom: 72 }}>
      <header style={{ padding: "48px 0 32px" }}>
        <p className="eyebrow">Contact us</p>
        <h1>Come and see us</h1>
        <p className="lead">The best way to choose a fire is to see it burning. Call in to the showroom, or get in touch and we'll be happy to help.</p>
      </header>
      <div className="contact-grid">
        <div className="panel">
          <h3>Showroom</h3>
          <address style={{ fontStyle: "normal" }}>
            {STORE.name}<br />{a.street}<br />{a.town}<br />{a.county}<br />{a.eircode}
          </address>
          <p style={{ marginTop: 16 }}><a className="btn btn--dark" href={STORE.mapUrl} target="_blank" rel="noopener">Open in Google Maps</a></p>
        </div>
        <div className="panel">
          <h3>Call</h3>
          <p><a className="link" style={{ fontSize: "1.4rem" }} href={`tel:${STORE.phoneIntl}`}>{STORE.phone}</a></p>
          <h3>Email</h3>
          <p><a className="link" href={`mailto:${STORE.email}`}>{STORE.email}</a></p>
        </div>
      </div>
    </div>
  );
}
