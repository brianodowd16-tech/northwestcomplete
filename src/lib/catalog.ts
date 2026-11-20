import { boats } from "@/data/boats";
import { products } from "@/data/products";
import { services } from "@/data/services";

export type CatalogItem = {
  id: string;
  name: string;
  description: string;
  /** Unit price in euro cents, VAT inclusive. */
  price: number;
  kind: "product" | "service" | "boat-deposit";
  unit: "item" | "per-foot" | "deposit" | "fixed";
  shippable: boolean;
  available: boolean;
  minQty: number;
  maxQty: number;
  href: string;
};

const BOAT_DEPOSIT_PREFIX = "boat-deposit:";

export function boatDepositId(slug: string) {
  return `${BOAT_DEPOSIT_PREFIX}${slug}`;
}

/**
 * Single source of truth for anything that can go in the cart. Checkout always
 * re-resolves items here so prices can never be set by the browser.
 */
export function getCatalogItem(id: string): CatalogItem | undefined {
  const product = products.find((p) => p.id === id);
  if (product) {
    return {
      id: product.id,
      name: product.name,
      description: product.description,
      price: product.price,
      kind: "product",
      unit: "item",
      shippable: product.shippable,
      available: product.inStock,
      minQty: 1,
      maxQty: 20,
      href: `/shop/${product.slug}`,
    };
  }

  for (const service of services) {
    const option = service.options.find((o) => o.id === id);
    if (option) {
      const perFoot = option.unit === "per-foot";
      return {
        id: option.id,
        name: `${service.name}: ${option.name}`,
        description: option.description,
        price: option.price,
        kind: "service",
        unit: option.unit,
        shippable: false,
        available: true,
        minQty: perFoot ? 10 : 1,
        maxQty: perFoot ? 80 : 5,
        href: `/services/${service.slug}`,
      };
    }
  }

  if (id.startsWith(BOAT_DEPOSIT_PREFIX)) {
    const boat = boats.find((b) => b.slug === id.slice(BOAT_DEPOSIT_PREFIX.length));
    if (boat) {
      return {
        id,
        name: `Reservation deposit: ${boat.year} ${boat.title}`,
        description: "Refundable deposit to reserve this boat pending viewing / survey.",
        price: boat.reservationDeposit,
        kind: "boat-deposit",
        unit: "deposit",
        shippable: false,
        available: boat.status === "For Sale",
        minQty: 1,
        maxQty: 1,
        href: `/boats/${boat.slug}`,
      };
    }
  }

  return undefined;
}

export type DeliveryCountry = {
  code: "IE" | "NI" | "MT";
  /** ISO 3166-1 alpha-3 code sent to myPOS. */
  iso3: "IRL" | "GBR" | "MLT";
  name: string;
  /** Tracked delivery price in cents. */
  delivery: number;
  /** Orders of goods at or above this value (cents) ship free. */
  freeOver: number;
};

export const COUNTRIES: DeliveryCountry[] = [
  { code: "IE", iso3: "IRL", name: "Ireland", delivery: 795, freeOver: 10000 },
  { code: "NI", iso3: "GBR", name: "Northern Ireland", delivery: 795, freeOver: 10000 },
  { code: "MT", iso3: "MLT", name: "Malta & Gozo", delivery: 1495, freeOver: 15000 },
];

export const getCountry = (code: string) => COUNTRIES.find((c) => c.code === code);

/** Delivery price in cents for a goods subtotal; 0 when collecting or above the free threshold. */
export function deliveryPrice(country: DeliveryCountry, goodsTotal: number, method: "delivery" | "collect") {
  if (method === "collect" || goodsTotal === 0 || goodsTotal >= country.freeOver) return 0;
  return country.delivery;
}

/** Shown in shop copy: the Irish rate and threshold. */
export const SHIPPING = { standard: COUNTRIES[0].delivery, freeOver: COUNTRIES[0].freeOver };
