// Pulls products from the live shop into products.json so hotspots show real
// names, prices, descriptions and images, and checkout hands the cart over.
//
//   node scripts/sync-catalog.mjs --shopify https://odowdscarrick.com
//   node scripts/sync-catalog.mjs --woocommerce https://odowdscarrick.com
//
// Hotspots reference products by SKU. Products are keyed by their shop SKU,
// falling back to the Shopify handle / WooCommerce slug when a SKU is empty.
// Existing checkout settings are kept; checkout.mode is switched to the shop.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    tour: { type: 'string', default: 'odowds' },
    shopify: { type: 'string' },
    woocommerce: { type: 'string' },
  },
});

const store = (args.shopify ?? args.woocommerce ?? '').replace(/\/$/, '');
if (!store) {
  console.error('Usage: node scripts/sync-catalog.mjs --shopify <store-url> | --woocommerce <store-url>');
  process.exit(1);
}

const file = path.resolve('public/tours', args.tour, 'products.json');
const catalog = JSON.parse(await readFile(file, 'utf8'));
const stripHtml = (html) => String(html ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

async function fromShopify() {
  const out = [];
  for (let page = 1; ; page++) {
    const { products } = await getJson(`${store}/products.json?limit=250&page=${page}`);
    if (!products.length) break;
    for (const p of products) {
      for (const v of p.variants) {
        const variantName = p.variants.length > 1 && v.title !== 'Default Title' ? ` – ${v.title}` : '';
        out.push({
          sku: v.sku || (p.variants.length > 1 ? `${p.handle}-${v.id}` : p.handle),
          name: p.title + variantName,
          category: p.product_type || undefined,
          price: Number(v.price),
          compareAtPrice: v.compare_at_price ? Number(v.compare_at_price) : undefined,
          image: (p.images.find((i) => i.id === v.image_id) ?? p.images[0])?.src,
          url: `${store}/products/${p.handle}${p.variants.length > 1 ? `?variant=${v.id}` : ''}`,
          description: stripHtml(p.body_html),
          inStock: v.available,
          shopifyVariantId: v.id,
        });
      }
    }
  }
  return out;
}

async function fromWooCommerce() {
  const out = [];
  for (let page = 1; ; page++) {
    const products = await getJson(`${store}/wp-json/wc/store/v1/products?per_page=100&page=${page}`);
    if (!products.length) break;
    for (const p of products) {
      const unit = 10 ** (p.prices.currency_minor_unit ?? 2);
      out.push({
        sku: p.sku || p.slug,
        name: stripHtml(p.name),
        category: p.categories?.[0]?.name,
        price: Number(p.prices.price) / unit,
        compareAtPrice: p.on_sale ? Number(p.prices.regular_price) / unit : undefined,
        image: p.images?.[0]?.src,
        url: p.permalink,
        description: stripHtml(p.short_description || p.description),
        inStock: p.is_in_stock,
        wooProductId: p.id,
      });
      if (!catalog.currency && p.prices.currency_code) catalog.currency = p.prices.currency_code;
    }
  }
  return out;
}

const products = args.shopify ? await fromShopify() : await fromWooCommerce();
const tour = JSON.parse(await readFile(path.resolve('public/tours', args.tour, 'tour.json'), 'utf8'));
const synced = new Set(products.map((p) => p.sku));
const pinned = new Set(tour.nodes.flatMap((n) => (n.hotspots ?? []).map((h) => h.sku)));
const orphaned = [...pinned].filter((sku) => !synced.has(sku));

catalog.products = products.map((p) => JSON.parse(JSON.stringify(p)));
catalog.checkout = { ...catalog.checkout, mode: args.shopify ? 'shopify' : 'woocommerce', storeUrl: store };
await writeFile(file, JSON.stringify(catalog, null, 2) + '\n');

console.log(`Synced ${products.length} products from ${store}`);
if (orphaned.length) {
  console.log(`These pinned SKUs are not in the shop and need re-pinning in the editor: ${orphaned.join(', ')}`);
}
