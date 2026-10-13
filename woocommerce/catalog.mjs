// Builds the WooCommerce catalogue (categories + products) from the site data in src/data.
// Run scripts with: node --experimental-strip-types woocommerce/<script>.mjs
import { boats } from "../src/data/boats.ts";
import { products } from "../src/data/products.ts";
import { services } from "../src/data/services.ts";

const euro = (cents) => (cents / 100).toFixed(2);
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const list = (items) => `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;

/** Categories as [name, parentName | null]. Parents come before children. */
export const categories = [
  ["Services", null],
  ...services.map((s) => [s.name, "Services"]),
  ["Shop", null],
  ...Array.from(new Set(products.map((p) => p.category))).map((c) => [c, "Shop"]),
  ["Boats for Sale", null],
];

/**
 * Every product carries a stable SKU so re-running the sync updates rather than duplicates.
 * `categoryPath` is [parent, child] or [top-level].
 */
export function buildProducts() {
  const out = [];

  for (const s of services) {
    for (const o of s.options) {
      const perFoot = o.unit === "per-foot";
      const deposit = o.unit === "deposit";
      out.push({
        sku: `NWBM-${o.id}`,
        name: perFoot ? `${o.name} — price per foot` : o.name,
        type: "simple",
        virtual: true,
        regular_price: euro(o.price),
        categoryPath: ["Services", s.name],
        short_description: perFoot
          ? `<p>${esc(o.description)}</p><p><strong>Set the quantity to your boat length in feet</strong> (e.g. 26 for a 26ft boat).</p>`
          : `<p>${esc(o.description)}</p>`,
        description: [
          `<p>${esc(s.intro)}</p>`,
          `<h3>What's included</h3>`,
          list(s.includes),
          `<h3>How booking works</h3>`,
          list([
            deposit ? "Pay the deposit online to secure your slot." : "Pay securely online.",
            "We contact you within one working day to arrange a date.",
            "Any parts or extra work are agreed with you before we start.",
          ]),
          perFoot ? `<p>Priced per foot of overall boat length. If the actual length differs we'll adjust before starting work.</p>` : "",
        ].join(""),
        sold_individually: deposit,
      });
    }
  }

  for (const p of products) {
    out.push({
      sku: `NWBM-${p.id}`,
      name: p.name,
      type: "simple",
      virtual: !p.shippable,
      regular_price: euro(p.price),
      categoryPath: ["Shop", p.category],
      short_description: `<p>${esc(p.description)}</p>`,
      description: `<p>${esc(p.description)}</p>${list(p.details)}`,
      stock_status: p.inStock ? "instock" : "outofstock",
    });
  }

  for (const b of boats) {
    out.push({
      sku: `NWBM-boat-${b.slug}`,
      name: `${b.year} ${b.title} — reservation deposit`,
      type: "simple",
      virtual: true,
      regular_price: euro(b.reservationDeposit),
      categoryPath: ["Boats for Sale"],
      sold_individually: true,
      short_description: `<p><strong>Asking price: €${(b.price / 100).toLocaleString("en-IE")}</strong> · ${b.lengthFt}ft ${esc(b.type)} · ${esc(b.location)}</p><p>Pay a refundable €${euro(b.reservationDeposit)} deposit to reserve this boat while you arrange a viewing, sea trial or survey.</p>`,
      description: [
        `<p>${esc(b.summary)}</p>`,
        `<ul><li>Year: ${b.year}</li><li>Length: ${b.lengthFt} ft</li><li>Engine: ${esc(b.engine)}</li><li>Location: ${esc(b.location)}</li><li>Status: ${esc(b.status)}</li></ul>`,
        `<h3>Features</h3>`,
        list(b.features),
      ].join(""),
      // Sample listings must never go live by accident.
      forceDraft: true,
      stock_status: b.status === "For Sale" ? "instock" : "outofstock",
    });
  }

  return out;
}
