import Image from "next/image";
import Link from "next/link";
import type { Product } from "@/lib/woo";
import { Price } from "./Price";

export function ProductCard({ product, priority }: { product: Product; priority?: boolean }) {
  const img = product.images[0];
  const pct = product.onSale ? Math.round((1 - product.priceCents / product.regularPriceCents) * 100) : 0;
  return (
    <Link href={`/shop/${product.slug}`} className="card">
      {!product.inStock ? <span className="badge badge--muted">Sold out</span> : pct >= 5 ? <span className="badge">−{pct}%</span> : null}
      <div className="card__media">
        {img && <Image src={img.src} alt={img.alt} fill sizes="(max-width: 600px) 100vw, (max-width: 1000px) 50vw, 300px" priority={priority} />}
      </div>
      <div className="card__body">
        <h3 className="card__title">{product.name}</h3>
        <div className="card__meta">
          <Price now={product.priceCents} was={product.regularPriceCents} currency={product.currency} />
        </div>
      </div>
    </Link>
  );
}
