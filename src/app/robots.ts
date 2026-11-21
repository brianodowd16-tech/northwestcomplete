import type { MetadataRoute } from "next";
import { MARKET_IDS, MARKETS } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/cart", "/checkout"] },
    sitemap: MARKET_IDS.map((id) => `${MARKETS[id].url}/sitemap.xml`),
  };
}
