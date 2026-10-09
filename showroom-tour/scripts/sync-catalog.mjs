// Pulls products from the live shop into products.json so hotspots show real
// names, prices, descriptions and images, and checkout hands the cart over.
//
//   node scripts/sync-catalog.mjs --shopify https://odowdscarrick.com
//   node scripts/sync-catalog.mjs --woocommerce https://odowdscarrick.com
//
// Hotspots reference products by SKU. Products are keyed by their shop SKU,
// falling back to the Shopify handle / WooCommerce slug when a SKU is empty.
// WooCommerce variable products become one entry per variation.
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
const decodeEntities = (s) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
// One line, for names.
const stripHtml = (html) => decodeEntities(String(html ?? '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
// Keeps paragraph and line breaks, for descriptions.
const htmlToText = (html) =>
  decodeEntities(String(html ?? '').replace(/<br\s*\/?>|<\/(p|div|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, ' '))
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');

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
          description: htmlToText(p.body_html),
          inStock: v.available,
          shopifyVariantId: v.id,
        });
      }
    }
  }
  return out;
}

async function fromWooCommerce() {
  const api = `${store}/wp-json/wc/store/v1/products`;
  // `options` are the variation's attribute values from the parent listing, e.g. ['Black', '8kW'].
  const toProduct = (p, parent, options = []) => {
    const unit = 10 ** (p.prices.currency_minor_unit ?? 2);
    catalog.currency = p.prices.currency_code || catalog.currency;
    return {
      sku: p.sku || (parent ? `${parent.slug}-${p.id}` : p.slug),
      name: stripHtml(parent ? `${parent.name}${options.length ? ` – ${options.join(', ')}` : ''}` : p.name),
      category: (parent ?? p).categories?.[0]?.name,
      price: Number(p.prices.price) / unit,
      compareAtPrice: p.on_sale ? Number(p.prices.regular_price) / unit : undefined,
      image: (p.images?.[0] ?? parent?.images?.[0])?.src,
      url: p.permalink || parent?.permalink,
      description: htmlToText(p.short_description || p.description || parent?.short_description || parent?.description),
      inStock: p.is_in_stock,
      // WooCommerce reports 9999 when it isn't tracking stock.
      maxQty: p.add_to_cart?.maximum > 0 && p.add_to_cart.maximum < 9999 ? p.add_to_cart.maximum : undefined,
      wooProductId: p.id,
    };
  };

  const out = [];
  for (let page = 1, pages = 1; page <= pages; page++) {
    const res = await fetch(`${api}?per_page=100&page=${page}`, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`${api} page ${page} -> ${res.status}`);
    pages = Number(res.headers.get('X-WP-TotalPages')) || page;
    for (const p of await res.json()) {
      if (p.type === 'variable' && p.variations?.length) {
        // One entry per variation, so each colour or size can be pinned and added on its own.
        for (const v of p.variations) {
          const options = (v.attributes ?? []).map((a) => a.value).filter(Boolean);
          out.push(toProduct(await getJson(`${api}/${v.id}`), p, options));
        }
      } else {
        out.push(toProduct(p));
      }
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
