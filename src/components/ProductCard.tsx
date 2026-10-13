import Link from "next/link";
import type { Product } from "@/data/products";
import { getCatalogItem } from "@/lib/catalog";
import { formatPrice } from "@/lib/site";
import { AddToCartButton } from "./AddToCartButton";
import { Icon } from "./Icon";

const categoryIcon: Record<Product["category"], string> = {
  "Care & Polishing": "sparkle",
  "Engine Parts": "cog",
  "Electrical & Solar": "sun",
  "Gift Vouchers": "anchor",
};

export function ProductCard({ product }: { product: Product }) {
  const item = getCatalogItem(product.id)!;
  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      <Link href={`/shop/${product.slug}`} className="product-tile grid aspect-[4/3] place-items-center text-white">
        <Icon name={categoryIcon[product.category]} className="h-16 w-16 opacity-90" />
      </Link>
      <div className="flex flex-1 flex-col p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-sea-700">{product.category}</p>
        <h3 className="mt-1 font-display text-lg font-semibold text-navy-900">
          <Link href={`/shop/${product.slug}`} className="hover:text-sea-700">{product.name}</Link>
        </h3>
        <p className="mt-2 line-clamp-2 flex-1 text-sm text-slate-600">{product.description}</p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-lg font-bold text-navy-900">{formatPrice(product.price)}</span>
          <AddToCartButton item={item} label="Add" />
        </div>
      </div>
    </article>
  );
}
