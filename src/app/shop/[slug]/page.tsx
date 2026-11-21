import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import sanitizeHtml from "sanitize-html";
import { AddToCart } from "@/components/AddToCart";
import { Gallery } from "@/components/Gallery";
import { Icon } from "@/components/Icon";
import { JsonLd } from "@/components/JsonLd";
import { Price } from "@/components/Price";
import { SITE_URL, STORE } from "@/lib/config";
import { centsToDecimal } from "@/lib/money";
import { getProduct, getProducts } from "@/lib/woo";

export const revalidate = 300;

export async function generateStaticParams() {
  const products = await getProducts().catch(() => []);
  return products.map((p) => ({ slug: p.slug }));
}

type Props = { params: Promise<{ slug: string }> };

const plain = (html: string) => sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, " ").trim();

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await getProduct((await params).slug);
  if (!product) return {};
  const description = plain(product.shortDescription || product.description).slice(0, 160) || `${product.name} – special offer at ${STORE.name}.`;
  return {
    title: product.name,
    description,
    alternates: { canonical: `/shop/${product.slug}` },
    openGraph: { images: product.images.slice(0, 1).map((i) => i.src) },
  };
}

const SAFE_HTML: sanitizeHtml.IOptions = {
  allowedTags: ["p", "br", "strong", "b", "em", "i", "ul", "ol", "li", "h3", "h4", "a", "table", "thead", "tbody", "tr", "td", "th"],
  allowedAttributes: { a: ["href"] },
  allowedSchemes: ["https", "mailto", "tel"],
};

export default async function ProductPage({ params }: Props) {
  const product = await getProduct((await params).slug);
  if (!product) notFound();

  const description = sanitizeHtml(product.description || product.shortDescription, SAFE_HTML);
  const summary = sanitizeHtml(product.shortDescription, SAFE_HTML);
  const low = product.inStock && product.lowStock !== null && product.lowStock <= 3;

  return (
    <div className="wrap">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Product",
          name: product.name,
          sku: product.sku || undefined,
          image: product.images.map((i) => i.src),
          description: plain(product.description || product.shortDescription).slice(0, 500),
          offers: {
            "@type": "Offer",
            url: `${SITE_URL}/shop/${product.slug}`,
            priceCurrency: product.currency,
            price: centsToDecimal(product.priceCents),
            availability: product.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
            seller: { "@type": "Organization", name: STORE.name },
          },
        }}
      />
      <ol className="crumbs">
        <li><Link href="/">Home</Link></li>
        <li><Link href="/shop">Special offers</Link></li>
        <li aria-current="page">{product.name}</li>
      </ol>
      <div className="pdp">
        <Gallery images={product.images} name={product.name} />
        <div className="pdp__info">
          <h1>{product.name}</h1>
          <Price now={product.priceCents} was={product.regularPriceCents} currency={product.currency} large />
          <p style={{ marginTop: 14 }}>
            {!product.inStock ? (
              <span className="stock stock--out">Sold out</span>
            ) : low ? (
              <span className="stock stock--low">Only {product.lowStock} left</span>
            ) : (
              <span className="stock stock--in">In stock at our showroom</span>
            )}
          </p>
          {summary && <div className="prose" dangerouslySetInnerHTML={{ __html: summary }} />}
          <AddToCart
            disabled={!product.inStock || !product.purchasable}
            line={{ id: product.id, slug: product.slug, name: product.name, image: product.images[0]?.src ?? null, priceCents: product.priceCents, maxQty: product.maxQty }}
          />
          <div className="assure">
            <div><Icon name="lock" /><span>Secure card payment by myPOS. Visa &amp; Mastercard accepted.</span></div>
            <div><Icon name="store" /><span>Free Click &amp; Collect from our Carrick-on-Shannon showroom. We&apos;ll email when it&apos;s ready.</span></div>
            <div><Icon name="chat" /><span>Need advice on fitting, flues or hearths? <Link className="link" href="/#consultation">Start a consultation</Link>.</span></div>
          </div>
          {description && description !== summary && (
            <section style={{ marginTop: 32 }}>
              <h2>Details</h2>
              <div className="prose" dangerouslySetInnerHTML={{ __html: description }} />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
