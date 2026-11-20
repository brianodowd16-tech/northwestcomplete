import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { STORE } from "@/lib/config";

export const metadata: Metadata = {
  title: "About Us",
  description: "A family-run fireplace and stove business in Carrick-on-Shannon, Co. Roscommon, established in 1967.",
};

export default function AboutPage() {
  return (
    <>
      <div className="wrap section">
        <div className="split">
          <div>
            <p className="eyebrow">About us</p>
            <h1>Family-run since {STORE.since}</h1>
            <p className="lead">We are a family-run business in Carrick-on-Shannon, Co. Roscommon. We stock and display the best traditional and contemporary fireplaces, stoves, gas and electric fires to suit your taste and budget.</p>
            <p>Our fireplaces are made from a range of materials including marble, cast iron, wood, granite and limestone. Our award-winning showroom has over 80 different displays, so we guarantee you'll find the perfect fire for your needs. We also carry hearths, flues and stove accessories in store.</p>
            <p>We'll help you every step of the way, and we want every visit to our showroom to be enjoyable and memorable.</p>
            <Link href="/contact" className="btn btn--primary">Plan your visit</Link>
          </div>
          <div className="split__media">
            <Image src={STORE.heroImage} alt="The O'Dowd's showroom" fill sizes="(max-width: 860px) 100vw, 560px" priority />
          </div>
        </div>
      </div>
      <section className="section section--sand">
        <div className="wrap">
          <h2>What customers say</h2>
          <div className="grid">
            <blockquote className="panel" style={{ margin: 0 }}>
              <p>“Great selection and lovely displays. Ian was so helpful, friendly and an absolute pleasure to deal with. That really helped me with buying the twin wall flue and stove.”</p>
              <footer className="muted">Nicola, Google</footer>
            </blockquote>
            <blockquote className="panel" style={{ margin: 0 }}>
              <p>“I come here at least once a year to get my stove glass replaced or tightened. Great range of stoves and fuels for sale and the staff are excellent.”</p>
              <footer className="muted">Fergal Jennings, Google</footer>
            </blockquote>
          </div>
        </div>
      </section>
    </>
  );
}
