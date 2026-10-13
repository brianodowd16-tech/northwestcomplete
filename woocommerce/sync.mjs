// Pushes the catalogue, currency and shipping setup to the live WooCommerce store via the REST API.
//
//   WC_URL=https://northwestboatmaintenance.com WC_CONSUMER_KEY=ck_... WC_CONSUMER_SECRET=cs_... \
//     node --experimental-strip-types woocommerce/sync.mjs [--publish] [--dry-run]
//
// Products are created as drafts unless --publish is passed (sample boat listings always stay drafts).
// Re-running is safe: products are matched by SKU and updated, categories and zones by name.
import { buildProducts, categories } from "./catalog.mjs";

const base = (process.env.WC_URL ?? "https://northwestboatmaintenance.com").replace(/\/$/, "") + "/wp-json/wc/v3";
const key = process.env.WC_CONSUMER_KEY;
const secret = process.env.WC_CONSUMER_SECRET;
const publish = process.argv.includes("--publish");
const dryRun = process.argv.includes("--dry-run");

if (!key || !secret) {
  console.error("Set WC_CONSUMER_KEY and WC_CONSUMER_SECRET (WooCommerce → Settings → Advanced → REST API).");
  process.exit(1);
}

const auth = "Basic " + Buffer.from(`${key}:${secret}`).toString("base64");

async function wc(method, path, body) {
  if (dryRun && method !== "GET") {
    console.log(`[dry-run] ${method} ${path}`);
    return { id: 0 };
  }
  const res = await fetch(base + path, {
    method,
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function getAll(path) {
  const out = [];
  for (let page = 1; ; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const batch = await wc("GET", `${path}${sep}per_page=100&page=${page}`);
    out.push(...batch);
    if (batch.length < 100) return out;
  }
}

async function settings() {
  const currency = await wc("GET", "/settings/general/woocommerce_currency");
  if (currency.value !== "EUR") {
    console.log(`Currency: ${currency.value} → EUR`);
    await wc("PUT", "/settings/general/woocommerce_currency", { value: "EUR" });
  } else {
    console.log("Currency: already EUR");
  }
  const country = await wc("GET", "/settings/general/woocommerce_default_country");
  console.log(`Store country: ${country.value}${country.value.startsWith("IE") ? "" : "  ← should be Ireland (WooCommerce → Settings → General)"}`);
}

async function syncCategories() {
  const existing = await getAll("/products/categories");
  const ids = {};
  for (const [name, parent] of categories) {
    const parentId = parent ? ids[parent] : 0;
    const found = existing.find((c) => decode(c.name) === name && c.parent === parentId);
    if (found) {
      ids[name] = found.id;
    } else {
      const created = await wc("POST", "/products/categories", { name, parent: parentId });
      ids[name] = created.id;
      console.log(`Category created: ${parent ? parent + " > " : ""}${name}`);
    }
  }
  return ids;
}

async function syncProducts(catIds) {
  const existing = await getAll("/products?status=any");
  const bySku = new Map(existing.filter((p) => p.sku).map((p) => [p.sku, p]));
  let created = 0;
  let updated = 0;

  for (const p of buildProducts()) {
    const catName = p.categoryPath[p.categoryPath.length - 1];
    const payload = {
      name: p.name,
      type: p.type,
      sku: p.sku,
      regular_price: p.regular_price,
      virtual: p.virtual,
      short_description: p.short_description,
      description: p.description,
      categories: [{ id: catIds[catName] }],
      stock_status: p.stock_status ?? "instock",
      sold_individually: !!p.sold_individually,
      tax_status: "taxable",
    };
    const current = bySku.get(p.sku);
    if (current) {
      // Keep whatever status the owner has set since the first sync.
      await wc("PUT", `/products/${current.id}`, payload);
      updated++;
    } else {
      payload.status = publish && !p.forceDraft ? "publish" : "draft";
      await wc("POST", "/products", payload);
      created++;
    }
  }
  console.log(`Products: ${created} created, ${updated} updated${publish ? "" : " (new products saved as drafts)"}`);
}

async function syncShipping() {
  const zones = await wc("GET", "/shipping/zones");
  const plans = [
    { name: "Ireland", locations: [{ code: "IE", type: "country" }] },
    { name: "Northern Ireland", locations: [{ code: "GB", type: "country" }, { code: "BT*", type: "postcode" }] },
  ];
  for (const plan of plans) {
    let zone = zones.find((z) => z.name === plan.name);
    if (zone) {
      console.log(`Shipping zone exists, left unchanged: ${plan.name}`);
      continue;
    }
    zone = await wc("POST", "/shipping/zones", { name: plan.name });
    await wc("PUT", `/shipping/zones/${zone.id}/locations`, plan.locations);
    await wc("POST", `/shipping/zones/${zone.id}/methods`, {
      method_id: "flat_rate",
      settings: { title: "Tracked delivery (2–4 working days)", cost: "7.95", tax_status: "none" },
    });
    await wc("POST", `/shipping/zones/${zone.id}/methods`, {
      method_id: "free_shipping",
      settings: { title: "Free tracked delivery", requires: "min_amount", min_amount: "100" },
    });
    await wc("POST", `/shipping/zones/${zone.id}/methods`, {
      method_id: "local_pickup",
      settings: { title: "Collect from workshop / delivered to your boat", cost: "0" },
    });
    console.log(`Shipping zone created: ${plan.name} (€7.95 flat, free over €100, free collection)`);
  }
}

function decode(s) {
  return s.replace(/&amp;/g, "&").replace(/&#8211;/g, "–").replace(/&#8217;/g, "’");
}

await settings();
const catIds = await syncCategories();
await syncProducts(catIds);
await syncShipping();
console.log("Done.");
