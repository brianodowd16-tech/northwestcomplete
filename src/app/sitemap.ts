import type { MetadataRoute } from "next";
import { boats } from "@/data/boats";
import { products } from "@/data/products";
import { services } from "@/data/services";
import { site } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = [
    "",
    "/services",
    "/shop",
    "/boats",
    "/boats/sell",
    "/engine-sourcing",
    "/about",
    "/contact",
    "/terms",
    "/privacy",
    ...services.map((s) => `/services/${s.slug}`),
    ...products.map((p) => `/shop/${p.slug}`),
    ...boats.map((b) => `/boats/${b.slug}`),
  ];
  return paths.map((p) => ({ url: `${site.url}${p}`, lastModified: new Date() }));
}
