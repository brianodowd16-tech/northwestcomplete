import { vatFromGross, type VatRate } from "./money";

export type Station = "bar" | "kitchen";
export type Channel = "table" | "collect";

export interface PricedMenuItem {
  id: string;
  name: string;
  priceCents: number;
  vatRate: VatRate;
  station: Station;
  containsAlcohol: boolean;
  availableForCollect: boolean;
  active: boolean;
  soldOut: boolean;
  externalItemId?: string | null;
}

export interface CartRequestLine {
  menuItemId: string;
  qty: number;
}

export interface PricedLine {
  menuItem: PricedMenuItem;
  qty: number;
  unitPriceCents: number;
  grossCents: number;
  vatRate: VatRate;
  vatCents: number;
}

export interface PricedCart {
  lines: PricedLine[];
  grossCents: number;
  vat9Cents: number;
  vat23Cents: number;
  containsAlcohol: boolean;
}

export class CartError extends Error {}

export const MAX_QTY_PER_LINE = 20;

/**
 * Prices a cart from the venue's menu. The client only sends item IDs and
 * quantities; every price comes from `menu`, never from the request.
 */
export function priceCart(menu: Map<string, PricedMenuItem>, request: CartRequestLine[], channel: Channel): PricedCart {
  if (request.length === 0) throw new CartError("Cart is empty");
  const merged = new Map<string, number>();
  for (const { menuItemId, qty } of request) {
    if (!Number.isInteger(qty) || qty < 1) throw new CartError("Invalid quantity");
    merged.set(menuItemId, (merged.get(menuItemId) ?? 0) + qty);
  }

  const lines: PricedLine[] = [];
  for (const [menuItemId, qty] of merged) {
    const item = menu.get(menuItemId);
    if (!item || !item.active) throw new CartError("Item not available");
    if (item.soldOut) throw new CartError(`${item.name} is sold out`);
    if (qty > MAX_QTY_PER_LINE) throw new CartError(`Too many of ${item.name}`);
    if (channel === "collect" && (item.station !== "bar" || !item.availableForCollect)) {
      throw new CartError(`${item.name} can't be collected at the bar`);
    }
    const grossCents = item.priceCents * qty;
    lines.push({
      menuItem: item,
      qty,
      unitPriceCents: item.priceCents,
      grossCents,
      vatRate: item.vatRate,
      vatCents: vatFromGross(grossCents, item.vatRate),
    });
  }

  return {
    lines,
    grossCents: lines.reduce((s, l) => s + l.grossCents, 0),
    vat9Cents: lines.filter((l) => l.vatRate === 9).reduce((s, l) => s + l.vatCents, 0),
    vat23Cents: lines.filter((l) => l.vatRate === 23).reduce((s, l) => s + l.vatCents, 0),
    containsAlcohol: lines.some((l) => l.menuItem.containsAlcohol),
  };
}

/** Splits a priced cart into one group of lines per station (one docket each). */
export function splitByStation(lines: PricedLine[]): Map<Station, PricedLine[]> {
  const out = new Map<Station, PricedLine[]>();
  for (const l of lines) {
    const list = out.get(l.menuItem.station) ?? [];
    list.push(l);
    out.set(l.menuItem.station, list);
  }
  return out;
}

export function ageOn(dateOfBirth: string, today: Date): number {
  const [y, m, d] = dateOfBirth.split("-").map(Number);
  let age = today.getUTCFullYear() - y;
  const beforeBirthday = today.getUTCMonth() + 1 < m || (today.getUTCMonth() + 1 === m && today.getUTCDate() < d);
  if (beforeBirthday) age--;
  return age;
}
