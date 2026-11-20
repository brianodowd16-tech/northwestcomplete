import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/config";
import { RANGE_CATEGORIES, getRangePage } from "@/lib/content";
import { getProducts } from "@/lib/woo";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const fixed = ["", "/shop", "/range", "/servicing", "/about", "/contact", "/terms", "/privacy"].map((p) => ({ url: `${SITE_URL}${p}` }));
  const products = (await getProducts().catch(() => [])).map((p) => ({ url: `${SITE_URL}/shop/${p.slug}`, priority: 0.8 }));
  const ranges = await Promise.all(
    RANGE_CATEGORIES.map(async (c) => {
      const page = await getRangePage(c.slug).catch(() => null);
      const items = page?.groups.flatMap((g) => g.items) ?? [];
      return [{ url: `${SITE_URL}/range/${c.slug}` }, ...[...new Set(items.map((i) => i.slug))].map((s) => ({ url: `${SITE_URL}/range/${c.slug}/${s}` }))];
    }),
  );
  return [...fixed, ...products, ...ranges.flat()];
}
