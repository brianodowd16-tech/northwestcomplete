import Image from "next/image";
import Link from "next/link";
import type { Product } from "@/lib/woo";
import { Price } from "./Price";

export function ProductCard({ product, priority }: { product: Product; priority?: boolean }) {
  const img = product.images[0];
  const pct = product.onSale ? Math.round((1 - product.priceCents / product.regularPriceCents) * 100) : 0;
  return (
    <Link href={`/shop/${product.slug}`} className="card">
      <div className="card__media">
        {!product.inStock ? <span className="badge">Sold out</span> : pct >= 5 ? <span className="badge badge--ember">Save {pct}%</span> : null}
        {img && <Image src={img.src} alt={img.alt} fill sizes="(max-width: 520px) 100vw, (max-width: 1020px) 50vw, 25vw" priority={priority} />}
      </div>
      <div className="card__body">
        <h3 className="card__title">{product.name}</h3>
        <Price now={product.priceCents} was={product.regularPriceCents} currency={product.currency} />
      </div>
    </Link>
  );
}
