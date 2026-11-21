import type { MetadataRoute } from "next";
import { boats } from "@/data/boats";
import { products } from "@/data/products";
import { services } from "@/data/services";
import { MARKET_IDS, MARKETS } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return MARKET_IDS.flatMap((id) => {
    const m = MARKETS[id];
    const paths = [
      "",
      "/services",
      "/boats",
      "/boats/sell",
      "/engine-sourcing",
      "/about",
      "/contact",
      "/terms",
      "/privacy",
      ...services.map((s) => `/services/${s.slug}`),
      ...boats.filter((b) => b.market === id).map((b) => `/boats/${b.slug}`),
      ...(m.shop ? ["/shop", ...products.map((p) => `/shop/${p.slug}`)] : []),
    ];
    return paths.map((p) => ({ url: `${m.url}${p}`, lastModified: new Date() }));
  });
}
