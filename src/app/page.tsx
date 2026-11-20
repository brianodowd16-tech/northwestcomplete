import Image from "next/image";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { ProductCard } from "@/components/ProductCard";
import { SITE_URL, STORE } from "@/lib/config";
import { RANGE_CATEGORIES } from "@/lib/content";
import { getProducts } from "@/lib/woo";

export const revalidate = 300;

const SERVICING_IMAGE = "https://odowdscarrick.com/wp-content/uploads/2020/11/huntingdon-40-1-mi.jpg";

export default async function Home() {
  const products = await getProducts().catch(() => []);
  const offers = products.filter((p) => p.purchasable).slice(0, 8);
  const a = STORE.address;

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "HomeAndConstructionBusiness",
          name: STORE.name,
          url: SITE_URL,
          telephone: STORE.phoneIntl,
          email: STORE.email,
          foundingDate: String(STORE.since),
          image: STORE.heroImage,
          logo: STORE.logo,
          address: { "@type": "PostalAddress", streetAddress: a.street, addressLocality: a.town, addressRegion: a.county, postalCode: a.eircode, addressCountry: a.country },
        }}
      />

      <section className="hero">
        <Image src={STORE.heroImage} alt="O'Dowd's showroom on Station Road, Carrick-on-Shannon" fill priority sizes="100vw" className="hero__img" />
        <div className="wrap">
          <p className="eyebrow">Fireplaces · Stoves · Gas &amp; Electric Fires</p>
          <h1>Warmth, made to last since 1967.</h1>
          <p>Visit our award-winning Carrick-on-Shannon showroom with over 80 live displays, or shop our special offers online with secure card payment.</p>
          <div className="hero__actions">
            <Link href="/shop" className="btn btn--primary">Shop special offers</Link>
            <Link href="/range" className="btn btn--ghost">Explore the range</Link>
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingBottom: 0 }}>
        <div className="wrap trust">
          <div><strong>Since 1967</strong><span>Family-run fireplace specialists</span></div>
          <div><strong>80+ displays</strong><span>See every fire burning in store</span></div>
          <div><strong>Rated Excellent</strong><span>Across 58 Google reviews</span></div>
          <div><strong>Full servicing</strong><span>Glass, seals, grates &amp; door repairs</span></div>
        </div>
      </section>

      {offers.length > 0 && (
        <section className="section">
          <div className="wrap">
            <div className="head">
              <div>
                <p className="eyebrow">Special offers</p>
                <h2>Showroom deals, while stocks last</h2>
              </div>
              <Link href="/shop" className="link">View all offers →</Link>
            </div>
            <div className="grid">
              {offers.map((p, i) => <ProductCard key={p.id} product={p} priority={i < 2} />)}
            </div>
          </div>
        </section>
      )}

      <section className="section section--sand">
        <div className="wrap">
          <div className="head">
            <div>
              <p className="eyebrow">Our range</p>
              <h2>Find the right fire for your home</h2>
            </div>
            <Link href="/range" className="link">See everything →</Link>
          </div>
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
      </section>

      <section className="section">
        <div className="wrap split">
          <div className="split__media">
            <Image src={SERVICING_IMAGE} alt="Cast-iron stove in a traditional fireplace" fill sizes="(max-width: 860px) 100vw, 600px" />
          </div>
          <div>
            <p className="eyebrow">Maintenance &amp; servicing</p>
            <h2>We look after your stove for life</h2>
            <p className="lead">Our workshop keeps stoves of every make burning safely and efficiently.</p>
            <ul className="ticks">
              <li>Replacement door seals, glass, grates and fire bricks</li>
              <li>Door refurbishments in our own workshop</li>
              <li>Cleaning and maintenance products in store</li>
            </ul>
            <Link href="/servicing" className="btn btn--dark">Book a service</Link>
          </div>
        </div>
      </section>

      <section className="section section--dark">
        <div className="wrap split">
          <div>
            <p className="eyebrow">Visit the showroom</p>
            <h2>See it burning before you buy</h2>
            <p style={{ color: "#d9cfc3" }}>
              {a.street}, {a.town}, {a.county} {a.eircode}
            </p>
            <div className="hero__actions">
              <a href={STORE.mapUrl} className="btn btn--primary" target="_blank" rel="noopener">Get directions</a>
              <a href={`tel:${STORE.phoneIntl}`} className="btn btn--ghost" style={{ color: "#fff" }}>Call {STORE.phone}</a>
            </div>
          </div>
          <div>
            <p className="lead" style={{ color: "#e9dfd3" }}>
              “Great selection and lovely displays. Ian was so helpful, friendly and an absolute pleasure to deal with. He really knows the details and gives good suggestions.”
            </p>
            <p className="muted">— Nicola, Google review</p>
          </div>
        </div>
      </section>
    </>
  );
}
