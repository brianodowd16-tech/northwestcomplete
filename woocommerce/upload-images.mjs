// Uploads the site photos and logo to the WordPress Media Library, then attaches each
// service photo to its WooCommerce products and sets the logo as the site logo.
//
//   WP_USERNAME=... WP_APP_PASSWORD="xxxx xxxx xxxx xxxx xxxx xxxx" \
//     node woocommerce/upload-images.mjs [--dry-run]
//
// WP_APP_PASSWORD is an Application Password (Users → Profile → Application Passwords),
// not your normal login password. Re-running is safe: files already in the library
// (matched by filename) are reused instead of uploaded again.
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const site = (process.env.WC_URL ?? "https://northwestboatmaintenance.com").replace(/\/$/, "");
const user = process.env.WP_USERNAME;
const pass = process.env.WP_APP_PASSWORD;
const dryRun = process.argv.includes("--dry-run");

if (!user || !pass) {
  console.error("Set WP_USERNAME and WP_APP_PASSWORD (Users → Profile → Application Passwords).");
  process.exit(1);
}
const auth = "Basic " + Buffer.from(`${user}:${pass.replace(/\s+/g, "")}`).toString("base64");

/** Each photo, its alt text, and the WooCommerce SKU prefixes whose products should show it. */
const images = [
  {
    file: "public/images/northwest-boat-maintenance-logo.png",
    title: "Northwest Boat Maintenance logo",
    alt: "Northwest Boat Maintenance logo",
    siteLogo: true,
  },
  {
    file: "public/images/hero-yacht.webp",
    title: "Yacht at sea — home page banner",
    alt: "Motor yacht at anchor on calm blue water",
  },
  {
    file: "public/images/mechanical-engine-servicing.webp",
    title: "Mechanical engine servicing",
    alt: "Twin Mercury V8 inboard engines in a boat engine bay during servicing",
    skus: ["NWBM-mech-"],
  },
  {
    file: "public/images/machine-polishing-gelcoat.webp",
    title: "Machine polishing gelcoat",
    alt: "Machine polishing gelcoat on a boat superstructure to a mirror finish",
    skus: ["NWBM-polish-"],
  },
  {
    file: "public/images/antifouling-hull-painting.webp",
    title: "Antifouling hull painting",
    alt: "Technician in protective suit applying antifouling to a hull out of the water",
    skus: ["NWBM-grp-"],
  },
];

const types = { ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg" };

async function api(method, path, { body, headers = {} } = {}) {
  if (dryRun && method !== "GET") {
    console.log(`[dry-run] ${method} ${path}`);
    return { id: 0, source_url: "" };
  }
  const res = await fetch(site + "/wp-json" + path, { method, headers: { Authorization: auth, ...headers }, body });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
const json = (method, path, data) =>
  api(method, path, { body: JSON.stringify(data), headers: { "Content-Type": "application/json" } });

async function upload(img) {
  const name = basename(img.file);
  const stem = name.replace(/\.[^.]+$/, "");
  const existing = await api("GET", `/wp/v2/media?search=${encodeURIComponent(stem)}&per_page=20`);
  const found = existing.find((m) => basename(m.source_url ?? "").replace(/(-\d+)?\.[^.]+$/, "") === stem);
  if (found) {
    console.log(`Already in Media Library: ${name} (#${found.id})`);
    return found;
  }
  const ext = name.slice(name.lastIndexOf("."));
  const media = await api("POST", "/wp/v2/media", {
    body: readFileSync(img.file),
    headers: { "Content-Type": types[ext], "Content-Disposition": `attachment; filename="${name}"` },
  });
  await json("POST", `/wp/v2/media/${media.id}`, { title: img.title, alt_text: img.alt });
  console.log(`Uploaded: ${name} (#${media.id})`);
  return media;
}

async function allProducts() {
  const out = [];
  for (let page = 1; ; page++) {
    const batch = await api("GET", `/wc/v3/products?status=any&per_page=100&page=${page}`);
    out.push(...batch);
    if (batch.length < 100) return out;
  }
}

const uploaded = [];
for (const img of images) uploaded.push({ ...img, media: await upload(img) });

const products = uploaded.some((u) => u.skus) ? await allProducts() : [];
for (const u of uploaded) {
  if (u.siteLogo) {
    await json("POST", "/wp/v2/settings", { site_logo: u.media.id });
    console.log("Set as site logo (your theme may also have its own logo setting under Appearance → Customize).");
  }
  if (!u.skus) continue;
  const targets = products.filter((p) => u.skus.some((s) => (p.sku ?? "").startsWith(s)));
  for (const p of targets) {
    if (p.images?.some((i) => i.id === u.media.id)) continue;
    await json("PUT", `/wc/v3/products/${p.id}`, { images: [{ id: u.media.id }] });
  }
  console.log(`${basename(u.file)} → set as product image on ${targets.length} product(s)`);
}
if (products.length === 0 && uploaded.some((u) => u.skus)) {
  console.log("No NWBM products found yet — run `npm run woo:sync` first, then re-run this to attach photos.");
}
console.log("Done.");
