import Image from "next/image";
import Link from "next/link";
import { Consultation } from "@/components/Consultation";
import { Icon } from "@/components/Icon";
import { JsonLd } from "@/components/JsonLd";
import { ProductCard } from "@/components/ProductCard";
import { assistantEnabled } from "@/lib/assistant";
import { BRANDS, MERCH, RANGE_COVERS, SITE_URL, STORE } from "@/lib/config";
import { RANGE_CATEGORIES } from "@/lib/content";
import { getProducts } from "@/lib/woo";

export const revalidate = 300;

const FEATURED_RANGES = ["stoves", "fireplaces", "gas-fires", "electric-fires"];

export default async function Home() {
  const products = await getProducts().catch(() => []);
  const featured = products
    .filter((p) => p.purchasable && p.inStock && p.priceCents > MERCH.featuredMinCents)
    .sort((a, b) => b.priceCents - a.priceCents)
    .slice(0, MERCH.featuredCount);
  const a = STORE.address;
  const covered = RANGE_CATEGORIES.filter((c) => FEATURED_RANGES.includes(c.slug));
  const others = RANGE_CATEGORIES.filter((c) => !FEATURED_RANGES.includes(c.slug));

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "HomeAndConstructionBusiness",
          name: STORE.name,
          url: SITE_URL,
          email: STORE.email,
          foundingDate: String(STORE.since),
          image: STORE.showroomImage,
          logo: STORE.logo,
          brand: BRANDS.map((name) => ({ "@type": "Brand", name })),
          address: { "@type": "PostalAddress", streetAddress: a.street, addressLocality: a.town, addressRegion: a.county, postalCode: a.eircode, addressCountry: a.country },
        }}
      />

      {/* Hero */}
      <section className="hero">
        <div className="hero__grid">
          <div className="hero__copy">
              <p className="eyebrow">Fireplaces · Stoves · Gas &amp; Electric Fires</p>
              <h1>
                The fire at the heart of <span className="accent">your home.</span>
              </h1>
              <p className="lead">
                For over half a century, families across the region have trusted O&apos;Dowd&apos;s to choose, specify and care for their fires. Explore more than 80 live displays in Carrick-on-Shannon, or start your consultation online.
              </p>
              <div className="hero__actions">
                <Link href="#consultation" className="btn btn--primary">Start your consultation <Icon name="arrow" size={16} /></Link>
                <Link href="/range" className="btn btn--outline-light">Explore the range</Link>
              </div>
          </div>
          <div className="hero__media">
            <Image src={STORE.heroImage} alt="Gazco Studio gas fire set into a limestone chimney breast" fill priority sizes="(max-width: 900px) 100vw, 55vw" />
            <p className="hero__caption"><strong>Gazco Studio 1</strong> · gas fire</p>
          </div>
        </div>
      </section>

      {/* Credentials */}
      <section className="creds" aria-label="Why O'Dowd's">
        <div><strong className="num">{STORE.since}</strong><span>Family-run in Carrick-on-Shannon</span></div>
        <div><strong className="num">80+</strong><span>Live displays in our award-winning showroom</span></div>
        <div><strong>Excellent</strong><span>Rated across 58 Google reviews</span></div>
        <div><strong>Workshop</strong><span>Servicing, parts and repairs for most makes</span></div>
      </section>

      {/* Range */}
      <section className="section">
        <div className="wrap">
          <div className="head">
            <div>
              <p className="eyebrow">The range</p>
              <h2>Chosen from Europe&apos;s finest makers</h2>
              <p className="lead">From cast-iron multi-fuel stoves to frameless gas fires and limestone surrounds, every piece in the showroom is selected for craftsmanship, efficiency and lasting value.</p>
            </div>
            <Link href="/range" className="arrow-link">View the full range <Icon name="arrow" size={16} /></Link>
          </div>
          <div className="range-grid">
            {covered.map((c, i) => (
              <Link key={c.slug} href={`/range/${c.slug}`} className="range-tile">
                <Image src={RANGE_COVERS[c.slug]} alt="" fill sizes="(max-width: 560px) 100vw, (max-width: 1020px) 50vw, 25vw" priority={i < 2} />
                <span className="range-tile__label">
                  <strong>{c.name}</strong>
                  <span>{c.blurb}</span>
                </span>
              </Link>
            ))}
          </div>
          <div className="tiles" style={{ marginTop: 20 }}>
            {others.map((c) => (
              <Link key={c.slug} href={`/range/${c.slug}`} className="tile" style={{ minHeight: 0 }}>
                <div>
                  <h4 style={{ margin: "0 0 4px" }}>{c.name}</h4>
                  <p>{c.blurb}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Consultation */}
      <section className="section section--night" id="consultation">
        <div className="wrap consult">
          <div className="consult__intro">
            <p className="eyebrow">Speak with our team</p>
            <h2>Start your consultation <span className="accent" style={{ color: "var(--ember)" }}>online</span></h2>
            <p className="lead">Answer a few questions about your home and plans. You&apos;ll get tailored guidance on fuel, heat output and flue options, and our team will follow up to arrange your showroom visit.</p>
            <ul>
              <li><Icon name="check" /> Guidance based on Irish Building Regulations and current fuel rules</li>
              <li><Icon name="check" /> Sizing advice for your room, chimney and the age of your home</li>
              <li><Icon name="check" /> A follow-up from a specialist who has seen it all since 1967</li>
            </ul>
          </div>
          <Consultation aiEnabled={assistantEnabled()} email={STORE.email} />
        </div>
      </section>

      {/* Featured offers */}
      {featured.length > 0 && (
        <section className="section section--paper">
          <div className="wrap">
            <div className="head">
              <div>
                <p className="eyebrow">Showroom offers</p>
                <h2>Exceptional pieces, exceptional value</h2>
              </div>
              <Link href="/shop" className="arrow-link">All special offers <Icon name="arrow" size={16} /></Link>
            </div>
            <div className="grid grid--4">
              {featured.map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
          </div>
        </section>
      )}

      {/* Process */}
      <section className="section">
        <div className="wrap">
          <div className="head">
            <div>
              <p className="eyebrow">How we work</p>
              <h2>From first idea to the first fire</h2>
            </div>
          </div>
          <ol className="steps">
            <li><h3>Consultation</h3><p>Tell us about the room, the house and how you want to use it, online or in person.</p></li>
            <li><h3>Showroom visit</h3><p>See over 80 fires burning side by side and compare finishes, fuels and controls.</p></li>
            <li><h3>Specification</h3><p>We confirm the appliance, heat output, flue or liner and hearth requirements for your home.</p></li>
            <li><h3>Aftercare</h3><p>Our workshop keeps it running: seals, glass, grates, parts and annual servicing advice.</p></li>
          </ol>
        </div>
      </section>

      {/* Brands */}
      <section className="section section--paper" style={{ paddingBlock: "clamp(48px, 6vw, 80px)" }}>
        <div className="wrap">
          <p className="eyebrow" style={{ display: "flex", justifyContent: "center" }}>Brands in the showroom</p>
          <ul className="brands">
            {BRANDS.map((b) => <li key={b}>{b}</li>)}
          </ul>
        </div>
      </section>

      {/* Testimonials */}
      <section className="section">
        <div className="wrap">
          <div className="quotes">
            <blockquote className="quote">
              <div className="stars" aria-label="5 out of 5">★★★★★</div>
              <p>“Great selection and lovely displays. Ian was so helpful, friendly and an absolute pleasure to deal with. He really knows the details and gives good suggestions.”</p>
              <footer><strong>Nicola</strong> · Google review</footer>
            </blockquote>
            <blockquote className="quote">
              <div className="stars" aria-label="5 out of 5">★★★★★</div>
              <p>“I come here at least once a year to get my stove glass replaced or tightened. Great range of stoves and fuels, and the staff are excellent.”</p>
              <footer><strong>Fergal Jennings</strong> · Google review</footer>
            </blockquote>
          </div>
        </div>
      </section>

      {/* Showroom */}
      <section className="section section--stone2">
        <div className="wrap split">
          <div className="split__media">
            <Image src={STORE.showroomImage} alt="The O'Dowd's showroom on Station Road, Carrick-on-Shannon" fill sizes="(max-width: 900px) 100vw, 50vw" />
          </div>
          <div>
            <p className="eyebrow">Visit the showroom</p>
            <h2>See every fire <span className="accent">burning</span> before you choose</h2>
            <p className="lead">Our showroom on Station Road brings together more than 80 working displays, from traditional cast iron to contemporary frameless designs.</p>
            <dl className="dl" style={{ margin: "28px 0" }}>
              <div><dt>Address</dt><dd>{a.street}, {a.town}, {a.county} {a.eircode}</dd></div>
              <div><dt>Email</dt><dd><a className="link" href={`mailto:${STORE.email}`}>{STORE.email}</a></dd></div>
            </dl>
            <div className="hero__actions">
              <a href={STORE.mapUrl} className="btn btn--dark" target="_blank" rel="noopener">Get directions <Icon name="arrow" size={16} /></a>
              <Link href="#consultation" className="btn btn--outline">Book a consultation</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
