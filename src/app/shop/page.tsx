import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { ProductCard } from "@/components/ProductCard";
import { productCategories, products } from "@/data/products";
import { formatPrice } from "@/lib/site";
import { SHIPPING } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "Shop",
  description: "Boat care products, engine service parts, solar and electrical components and gift vouchers — delivered across Ireland.",
};

export default async function ShopPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const { category } = await searchParams;
  const active = productCategories.find((c) => c === category);
  const list = active ? products.filter((p) => p.category === active) : products;

  return (
    <>
      <PageHeader
        eyebrow="Shop"
        title="Parts, care products & gift vouchers"
        intro={`The products we trust on our own jobs. Tracked delivery across Ireland & Northern Ireland — free over ${formatPrice(SHIPPING.freeOver)} — or collect from us.`}
      />
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <nav className="flex flex-wrap gap-2" aria-label="Categories">
          <Link
            href="/shop"
            className={`rounded-full px-4 py-2 text-sm font-medium ${!active ? "bg-navy-800 text-white" : "bg-white text-navy-800 ring-1 ring-slate-200 hover:bg-slate-100"}`}
          >
            All
          </Link>
          {productCategories.map((c) => (
            <Link
              key={c}
              href={`/shop?category=${encodeURIComponent(c)}`}
              className={`rounded-full px-4 py-2 text-sm font-medium ${active === c ? "bg-navy-800 text-white" : "bg-white text-navy-800 ring-1 ring-slate-200 hover:bg-slate-100"}`}
            >
              {c}
            </Link>
          ))}
        </nav>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {list.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>
    </>
  );
}
