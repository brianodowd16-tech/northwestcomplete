// Inventory maths: cost of stock, recipe costs, gross profit, menu engineering, reorder suggestions,
// till-sales import. Quantities are integers in base units (ml, g, each); money is integer cents excl. VAT.
import { divRoundHalfUp, vatFromGross, type VatRate } from "./money";

export class InventoryError extends Error {}

export type StockUnit = "ml" | "g" | "each";
export const WASTE_REASONS = ["Spillage", "Breakage", "Out of date", "Returned by guest", "Staff drink", "Given away", "Line cleaning", "Other"] as const;

/** Value of `qty` base units at the item's pack price, rounded half-up (sign kept). */
export function valueAtCost(qty: number, packSize: number, packCostCents: number): number {
  if (packSize <= 0) return 0;
  const v = divRoundHalfUp(Math.abs(qty) * packCostCents, packSize);
  return qty < 0 ? -v : v;
}

/** Cost of one serving of a menu item: sum of each ingredient at cost (rounded once at the end). */
export function recipeCost(lines: { qty: number; packSize: number; packCostCents: number }[]): number {
  // Exact sum over a common denominator would overflow for many lines; per-line micro-cents keeps it exact enough.
  const micro = lines.reduce((s, l) => s + (l.packSize > 0 ? (l.qty * l.packCostCents * 1000) / l.packSize : 0), 0);
  return Math.round(micro / 1000);
}

/** Gross profit on one sale: price excl. VAT minus cost. */
export function grossProfit(priceGrossCents: number, vatRate: VatRate, costCents: number) {
  const netCents = priceGrossCents - vatFromGross(priceGrossCents, vatRate);
  const gpCents = netCents - costCents;
  return { netCents, costCents, gpCents, gpPct: netCents > 0 ? Math.round((gpCents / netCents) * 1000) / 10 : 0 };
}

export type MenuClass = "star" | "plowhorse" | "puzzle" | "dog";
export const MENU_CLASS_TEXT: Record<MenuClass, [string, string]> = {
  star: ["Star", "Popular and profitable: keep it prominent"],
  plowhorse: ["Workhorse", "Popular but low profit: check the price or the recipe cost"],
  puzzle: ["Hidden gem", "Profitable but not ordered much: promote it"],
  dog: ["Rethink", "Not popular and low profit: rework or drop it"],
};

/**
 * Menu engineering (Kasavana–Smith): popularity is high when an item's share of sales is at least
 * 70% of an even share; profit is high when its GP per serving is at least the sales-weighted average.
 */
export function menuEngineering<T extends { id: string; qty: number; gpCents: number }>(items: T[]): (T & { class: MenuClass })[] {
  const sold = items.filter((i) => i.qty > 0);
  const totalQty = sold.reduce((s, i) => s + i.qty, 0);
  if (!sold.length || !totalQty) return items.map((i) => ({ ...i, class: "dog" as MenuClass }));
  const popBar = (1 / sold.length) * 0.7;
  const avgGp = sold.reduce((s, i) => s + i.gpCents * i.qty, 0) / totalQty;
  return items.map((i) => {
    const popular = i.qty / totalQty >= popBar;
    const profitable = i.gpCents >= avgGp;
    return { ...i, class: (popular ? (profitable ? "star" : "plowhorse") : profitable ? "puzzle" : "dog") as MenuClass };
  });
}

/** Packs to order to get back above par. */
export function packsToOrder(onHand: number, par: number, packSize: number): number {
  if (par <= 0 || onHand >= par || packSize <= 0) return 0;
  return Math.ceil((par - onHand) / packSize);
}

/** "1.5 L", "330 ml", "2.25 kg", "12". */
export function formatQty(qty: number, unit: StockUnit): string {
  const n = (x: number) => x.toLocaleString("en-IE", { maximumFractionDigits: 2 });
  if (unit === "ml") return Math.abs(qty) >= 1000 ? `${n(qty / 1000)} L` : `${n(qty)} ml`;
  if (unit === "g") return Math.abs(qty) >= 1000 ? `${n(qty / 1000)} kg` : `${n(qty)} g`;
  return n(qty);
}

/** The unit people count in: litres, kilos or items. */
export const COUNT_UNIT: Record<StockUnit, { label: string; factor: number }> = { ml: { label: "L", factor: 1000 }, g: { label: "kg", factor: 1000 }, each: { label: "each", factor: 1 } };

/** Typed amount in the counting unit ("12.5" litres) → base units (12500 ml). */
export function parseCountQty(input: string | number, unit: StockUnit): number {
  const s = String(input ?? "").trim().replace(",", ".");
  if (!/^-?\d{1,7}(\.\d{1,3})?$/.test(s)) throw new InventoryError(`Enter an amount in ${COUNT_UNIT[unit].label}`);
  return Math.round(Number(s) * COUNT_UNIT[unit].factor);
}

/** Splits one CSV line, honouring quotes. */
function csvCells(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "",
    q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') (cur += '"'), i++;
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) out.push(cur.trim()), (cur = "");
    else cur += c;
  }
  out.push(cur.trim());
  return out;
}

/**
 * Reads a till's "sales by item" export (Revolut POS, myPOS or any CSV): finds the item and quantity
 * columns by their headings, adds up repeated items, skips totals.
 */
export function parseTillCsv(text: string): { name: string; qty: number }[] {
  const lines = String(text ?? "").replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new InventoryError("The file has no sales rows");
  const sep = [",", ";", "\t"].sort((a, b) => lines[0].split(b).length - lines[0].split(a).length)[0];
  const head = csvCells(lines[0], sep).map((h) => h.toLowerCase());
  const nameCol = head.findIndex((h) => /^(item|item name|product|product name|name|description|article)$/.test(h) || /item name|product name/.test(h));
  const qtyCol = head.findIndex((h) => /^(qty|quantity|sold|items sold|quantity sold|count|units|units sold)$/.test(h) || /quantity|qty/.test(h));
  if (nameCol < 0 || qtyCol < 0) throw new InventoryError("Couldn't find the item name and quantity columns. Export 'sales by item' from your till.");
  const sums = new Map<string, { name: string; qty: number }>();
  for (const l of lines.slice(1)) {
    const c = csvCells(l, sep);
    const name = (c[nameCol] ?? "").trim();
    const qty = Number(String(c[qtyCol] ?? "").replace(",", "."));
    if (!name || /^(total|sub ?total|grand total)$/i.test(name) || !Number.isFinite(qty) || qty === 0) continue;
    const k = name.toLowerCase();
    const prev = sums.get(k);
    sums.set(k, { name: prev?.name ?? name, qty: (prev?.qty ?? 0) + Math.round(qty) });
  }
  if (!sums.size) throw new InventoryError("No item sales found in the file");
  return [...sums.values()];
}

/** Push notification text when a docket is ready. */
export function readyNotice(station: "bar" | "kitchen", orderNumber: number, venueName: string, idCheck: boolean) {
  return station === "bar"
    ? { title: "Your drinks are ready", body: `Order #${orderNumber} is ready at the bar in ${venueName}. Show this number${idCheck ? " and your ID" : ""} when you collect.` }
    : { title: "Your food is on its way", body: `Order #${orderNumber} is coming to your table at ${venueName}.` };
}
