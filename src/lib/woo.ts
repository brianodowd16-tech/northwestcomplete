import "server-only";
import { WC_URL, wooCredentials } from "./config";
import { wpFetch } from "./http";
import { minorToCents } from "./money";

/* ---------- Catalogue (public Store API, cached) ---------- */

export const PRODUCTS_TAG = "products";

type StoreImage = { id: number; src: string; thumbnail: string; alt: string; name: string };
type StoreProduct = {
  id: number;
  slug: string;
  name: string;
  permalink: string;
  short_description: string;
  description: string;
  sku: string;
  prices: {
    price: string;
    regular_price: string;
    sale_price: string;
    currency_code: string;
    currency_minor_unit: number;
  };
  images: StoreImage[];
  categories: { id: number; name: string; slug: string }[];
  is_purchasable: boolean;
  is_in_stock: boolean;
  on_sale: boolean;
  low_stock_remaining: number | null;
  add_to_cart: { maximum: number; minimum: number };
};

export type Product = {
  id: number;
  slug: string;
  name: string;
  sku: string;
  shortDescription: string;
  description: string;
  priceCents: number;
  regularPriceCents: number;
  currency: string;
  onSale: boolean;
  purchasable: boolean;
  inStock: boolean;
  lowStock: number | null;
  maxQty: number;
  images: { src: string; alt: string }[];
  categories: { name: string; slug: string }[];
};

function mapProduct(p: StoreProduct): Product {
  const mu = p.prices.currency_minor_unit;
  const price = minorToCents(p.prices.price, mu);
  return {
    id: p.id,
    slug: p.slug,
    name: decodeEntities(p.name),
    sku: p.sku,
    shortDescription: p.short_description,
    description: p.description,
    priceCents: price,
    regularPriceCents: minorToCents(p.prices.regular_price || p.prices.price, mu),
    currency: p.prices.currency_code,
    onSale: p.on_sale,
    purchasable: p.is_purchasable,
    inStock: p.is_in_stock,
    lowStock: p.low_stock_remaining,
    maxQty: Math.max(1, Math.min(p.add_to_cart?.maximum || 99, 99)),
    images: p.images.map((i) => ({ src: i.src, alt: decodeEntities(i.alt || i.name || p.name) })),
    categories: p.categories.filter((c) => c.slug !== "uncategorized").map((c) => ({ name: c.name, slug: c.slug })),
  };
}

async function storeGet<T>(path: string, fresh = false): Promise<T> {
  const res = await wpFetch(`${WC_URL}/wp-json/wc/store/v1${path}`, {
    ...(fresh ? { cache: "no-store" as const } : { next: { revalidate: 300, tags: [PRODUCTS_TAG] } }),
  });
  if (!res.ok) throw new Error(`WooCommerce ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export async function getProducts(): Promise<Product[]> {
  const list = await storeGet<StoreProduct[]>("/products?per_page=100&orderby=date&order=desc");
  return list.map(mapProduct);
}

export async function getProduct(slug: string): Promise<Product | null> {
  const list = await storeGet<StoreProduct[]>(`/products?slug=${encodeURIComponent(slug)}`);
  return list[0] ? mapProduct(list[0]) : null;
}

/** Live (uncached) lookup used at checkout so prices and stock are never stale. */
export async function getProductsLive(ids: number[]): Promise<Map<number, Product>> {
  const list = await storeGet<StoreProduct[]>(`/products?include=${ids.join(",")}&per_page=100`, true);
  return new Map(list.map((p) => [p.id, mapProduct(p)]));
}

/* ---------- Orders (authenticated REST API v3) ---------- */

export class WooNotConfigured extends Error {
  constructor() {
    super("WooCommerce API keys are not configured (WC_CONSUMER_KEY / WC_CONSUMER_SECRET).");
  }
}

async function rest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const creds = wooCredentials();
  if (!creds) throw new WooNotConfigured();
  const res = await wpFetch(`${WC_URL}/wp-json/wc/v3${path}`, {
    method,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Basic " + Buffer.from(`${creds.key}:${creds.secret}`).toString("base64"),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`WooCommerce ${method} ${path} → ${res.status} ${text.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

export type WooAddress = {
  first_name: string;
  last_name: string;
  address_1: string;
  address_2?: string;
  city: string;
  state?: string;
  postcode: string;
  country: string;
  email?: string;
  phone?: string;
};

export type WooOrder = {
  id: number;
  number: string;
  order_key: string;
  status: string;
  currency: string;
  total: string;
  total_tax: string;
  shipping_total: string;
  shipping_tax: string;
  date_created: string;
  date_paid: string | null;
  transaction_id: string;
  payment_method: string;
  billing: WooAddress;
  shipping: WooAddress;
  line_items: { id: number; product_id: number; name: string; quantity: number; total: string; total_tax: string }[];
  shipping_lines: { method_title: string; total: string; total_tax: string }[];
  fee_lines: { name: string; total: string; total_tax: string }[];
};

export type NewOrder = {
  billing: WooAddress;
  shipping?: WooAddress;
  line_items: { product_id: number; quantity: number }[];
  shipping_lines: { method_id: string; method_title: string; total: string }[];
  customer_note?: string;
};

export function createOrder(order: NewOrder): Promise<WooOrder> {
  return rest<WooOrder>("POST", "/orders", {
    ...order,
    status: "pending",
    set_paid: false,
    payment_method: "mypos",
    payment_method_title: "Card payment (myPOS)",
    created_via: "northwestcomplete",
  });
}

export const getOrder = (id: number) => rest<WooOrder>("GET", `/orders/${id}`);

export const updateOrder = (id: number, patch: Record<string, unknown>) => rest<WooOrder>("PUT", `/orders/${id}`, patch);

export const addOrderNote = (id: number, note: string) =>
  rest<unknown>("POST", `/orders/${id}/notes`, { note, customer_note: false });

export const PAID_STATUSES = new Set(["processing", "completed"]);

/* ---------- helpers ---------- */

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", times: "×" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}
