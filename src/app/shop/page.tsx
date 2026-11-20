import type { Metadata } from "next";
import { ProductCard } from "@/components/ProductCard";
import { getProducts } from "@/lib/woo";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Special Offers",
  description: "Showroom special offers on stoves, electric fires, fire pits and outdoor heating. Buy online with secure card payment or collect in Carrick-on-Shannon.",
};

export default async function ShopPage() {
  const products = await getProducts();
  const available = products.filter((p) => p.purchasable);

  return (
    <div className="wrap" style={{ paddingBottom: 72 }}>
      <header style={{ padding: "48px 0 32px" }}>
        <p className="eyebrow">Special offers</p>
        <h1>Showroom deals</h1>
        <p className="lead">Reduced showroom stock and end-of-line offers. Order online and collect from the showroom, or we'll call to arrange delivery.</p>
      </header>
      {available.length ? (
        <div className="grid">
          {available.map((p, i) => <ProductCard key={p.id} product={p} priority={i < 4} />)}
        </div>
      ) : (
        <p className="empty">New offers are on the way. Call in to the showroom to see what's available.</p>
      )}
    </div>
  );
}
