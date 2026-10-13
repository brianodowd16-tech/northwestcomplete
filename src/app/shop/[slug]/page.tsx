import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToCartButton } from "@/components/AddToCartButton";
import { Icon } from "@/components/Icon";
import { getProduct, products } from "@/data/products";
import { getCatalogItem, SHIPPING } from "@/lib/catalog";
import { formatPrice } from "@/lib/site";

type Params = Promise<{ slug: string }>;

export function generateStaticParams() {
  return products.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const product = getProduct((await params).slug);
  if (!product) return {};
  return { title: product.name, description: product.description };
}

export default async function ProductPage({ params }: { params: Params }) {
  const product = getProduct((await params).slug);
  if (!product) notFound();
  const item = getCatalogItem(product.id)!;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    category: product.category,
    offers: {
      "@type": "Offer",
      priceCurrency: "EUR",
      price: (product.price / 100).toFixed(2),
      availability: product.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav className="text-sm text-slate-500">
        <Link href="/shop" className="hover:text-sea-700">Shop</Link> /{" "}
        <Link href={`/shop?category=${encodeURIComponent(product.category)}`} className="hover:text-sea-700">{product.category}</Link>
      </nav>
      <div className="mt-6 grid gap-10 lg:grid-cols-2">
        <div className="product-tile grid aspect-square place-items-center rounded-2xl text-white">
          <Icon name={product.category === "Electrical & Solar" ? "sun" : product.category === "Engine Parts" ? "cog" : product.category === "Gift Vouchers" ? "anchor" : "sparkle"} className="h-28 w-28 opacity-90" />
        </div>
        <div>
          <h1 className="font-display text-3xl font-bold text-navy-900 sm:text-4xl">{product.name}</h1>
          <p className="mt-3 text-2xl font-bold text-navy-900">{formatPrice(product.price)}</p>
          <p className="text-sm text-slate-500">Includes VAT</p>
          <p className="mt-5 text-slate-700">{product.description}</p>
          <ul className="mt-5 space-y-2">
            {product.details.map((d) => (
              <li key={d} className="flex gap-2 text-slate-700">
                <Icon name="check" className="h-5 w-5 shrink-0 text-sea-600" /> {d}
              </li>
            ))}
          </ul>
          <AddToCartButton item={item} withQuantity className="mt-8" />
          <div className="mt-8 rounded-xl bg-white p-5 text-sm text-slate-600 ring-1 ring-slate-200">
            {product.shippable ? (
              <p>
                Tracked delivery in 2–4 working days across Ireland & NI: {formatPrice(SHIPPING.standard)}, free over{" "}
                {formatPrice(SHIPPING.freeOver)}. Free collection, or we&apos;ll bring it to your boat when we&apos;re next working on it.
              </p>
            ) : (
              <p>Delivered by email within one working day of payment.</p>
            )}
            <p className="mt-2">14-day returns on unopened items. <Link href="/terms" className="underline">Terms</Link></p>
          </div>
        </div>
      </div>
    </div>
  );
}
