// Writes woocommerce/products.csv for WooCommerce → Products → Import (no API key needed).
import { writeFileSync } from "node:fs";
import { buildProducts } from "./catalog.mjs";

const cols = [
  "Type", "SKU", "Name", "Published", "Short description", "Description", "Tax status",
  "In stock?", "Sold individually?", "Regular price", "Categories", "Virtual?",
];
const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

const rows = buildProducts().map((p) => [
  p.type,
  p.sku,
  p.name,
  -1, // -1 = draft: review prices, then publish
  p.short_description,
  p.description,
  "taxable",
  p.stock_status === "outofstock" ? 0 : 1,
  p.sold_individually ? 1 : 0,
  p.regular_price,
  p.categoryPath.join(" > "),
  p.virtual ? 1 : 0,
]);

const csv = [cols, ...rows].map((r) => r.map(q).join(",")).join("\n") + "\n";
const file = new URL("./products.csv", import.meta.url);
writeFileSync(file, csv);
console.log(`Wrote ${rows.length} products to ${file.pathname}`);
