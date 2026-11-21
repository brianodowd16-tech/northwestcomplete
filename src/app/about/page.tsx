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
            <h1>Family-run since <span className="accent">{STORE.since}</span></h1>
            <p className="lead">We are a family-run business in Carrick-on-Shannon, Co. Roscommon. We stock and display the best traditional and contemporary fireplaces, stoves, gas and electric fires to suit your taste and budget.</p>
            <p>Our fireplaces are made from a range of materials including marble, cast iron, wood, granite and limestone. Our award-winning showroom has over 80 different displays, so we guarantee you'll find the perfect fire for your needs. We also carry hearths, flues and stove accessories in store.</p>
            <p>We'll help you every step of the way, and we want every visit to our showroom to be enjoyable and memorable.</p>
            <div className="hero__actions"><Link href="/contact" className="btn btn--dark">Plan your visit</Link><Link href="/#consultation" className="btn btn--outline">Start a consultation</Link></div>
          </div>
          <div className="split__media">
            <Image src={STORE.showroomImage} alt="The O'Dowd's showroom" fill sizes="(max-width: 860px) 100vw, 560px" priority />
          </div>
        </div>
      </div>
      <section className="section section--paper">
        <div className="wrap">
          <p className="eyebrow">What customers say</p>
          <div className="quotes">
            <blockquote className="quote">
              <p>“Great selection and lovely displays. Ian was so helpful, friendly and an absolute pleasure to deal with. That really helped me with buying the twin wall flue and stove.”</p>
              <footer><strong>Nicola</strong> · Google review</footer>
            </blockquote>
            <blockquote className="quote">
              <p>“I come here at least once a year to get my stove glass replaced or tightened. Great range of stoves and fuels for sale and the staff are excellent.”</p>
              <footer><strong>Fergal Jennings</strong> · Google review</footer>
            </blockquote>
          </div>
        </div>
      </section>
    </>
  );
}
