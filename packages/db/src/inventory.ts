import {
  InventoryError,
  WASTE_REASONS,
  grossProfit,
  menuEngineering,
  packsToOrder,
  recipeCost,
  valueAtCost,
  vatFromGross,
  type StockUnit,
} from "@round/core";
import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { publish, topics, withTenant, type Tx } from "./index";
import * as t from "./schema";
import type { Staff, Venue } from "./services";

// Built-in inventory. On hand = sum(stock_movement.qty). Paid app orders deplete stock through recipes,
// refunds put it back, deliveries add, waste and counts correct it.

type Item = typeof t.stockItem.$inferSelect;
const name80 = (s: unknown, what: string) => {
  const n = String(s ?? "").trim().replace(/\s+/g, " ");
  if (n.length < 1 || n.length > 80) throw new InventoryError(`Enter ${what}`);
  return n;
};
const posInt = (n: unknown, what: string, max = 10_000_000) => {
  const v = Number(n);
  if (!Number.isInteger(v) || v < 0 || v > max) throw new InventoryError(`${what} must be a whole number`);
  return v;
};

async function onHandMap(tx: Tx, venueId: string, ids?: string[]) {
  const rows = await tx
    .select({ id: t.stockMovement.stockItemId, qty: sql<number>`coalesce(sum(${t.stockMovement.qty}),0)::int` })
    .from(t.stockMovement)
    .where(ids ? and(eq(t.stockMovement.venueId, venueId), inArray(t.stockMovement.stockItemId, ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])) : eq(t.stockMovement.venueId, venueId))
    .groupBy(t.stockMovement.stockItemId);
  return new Map(rows.map((r) => [r.id, r.qty]));
}

// ---------------------------------------------------------------- items, suppliers, recipes

export async function stockLevels(venue: Venue) {
  return withTenant(venue.tenantId, async (tx) => {
    const items = await tx.select().from(t.stockItem).where(eq(t.stockItem.venueId, venue.id)).orderBy(asc(t.stockItem.category), asc(t.stockItem.name));
    const sups = await tx.select().from(t.supplier).where(eq(t.supplier.venueId, venue.id)).orderBy(asc(t.supplier.name));
    const oh = await onHandMap(tx, venue.id);
    return {
      suppliers: sups,
      items: items.map((i) => {
        const onHand = oh.get(i.id) ?? 0;
        return { ...i, onHand, valueCents: valueAtCost(Math.max(0, onHand), i.packSize, i.packCostCents), low: i.active && i.parLevel > 0 && onHand < i.parLevel, supplierName: sups.find((s) => s.id === i.supplierId)?.name ?? "" };
      }),
    };
  });
}

export async function saveSupplier(venue: Venue, input: { id?: string; name: string; email?: string; phone?: string }) {
  const values = { name: name80(input.name, "the supplier's name"), email: String(input.email ?? "").trim().toLowerCase().slice(0, 200), phone: String(input.phone ?? "").trim().slice(0, 40) };
  if (values.email && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(values.email)) throw new InventoryError("Enter a valid email for the supplier");
  return withTenant(venue.tenantId, async (tx) => {
    if (input.id) {
      const [r] = await tx.update(t.supplier).set(values).where(and(eq(t.supplier.id, input.id), eq(t.supplier.venueId, venue.id))).returning();
      if (!r) throw new InventoryError("Supplier not found");
      return r;
    }
    const [r] = await tx.insert(t.supplier).values({ ...values, tenantId: venue.tenantId, venueId: venue.id }).returning();
    return r;
  });
}

export interface StockItemInput {
  id?: string;
  name: string;
  category?: string;
  unit: string;
  supplierId?: string | null;
  packSize: number;
  packName?: string;
  packCostCents: number;
  parLevel: number;
  active?: boolean;
}
export async function saveStockItem(venue: Venue, input: StockItemInput) {
  if (!["ml", "g", "each"].includes(input.unit)) throw new InventoryError("Choose ml, g or each");
  const values = {
    name: name80(input.name, "a name"),
    category: String(input.category ?? "").trim().slice(0, 40),
    unit: input.unit as StockUnit,
    supplierId: input.supplierId || null,
    packSize: posInt(input.packSize, "Pack size"),
    packName: String(input.packName ?? "pack").trim().slice(0, 30) || "pack",
    packCostCents: posInt(input.packCostCents, "Pack price"),
    parLevel: posInt(input.parLevel, "Par level"),
    active: input.active !== false,
  };
  if (values.packSize < 1) throw new InventoryError("Pack size must be at least 1");
  return withTenant(venue.tenantId, async (tx) => {
    if (values.supplierId) {
      const [s] = await tx.select().from(t.supplier).where(and(eq(t.supplier.id, values.supplierId), eq(t.supplier.venueId, venue.id)));
      if (!s) throw new InventoryError("Supplier not found");
    }
    try {
      if (input.id) {
        const [r] = await tx.update(t.stockItem).set(values).where(and(eq(t.stockItem.id, input.id), eq(t.stockItem.venueId, venue.id))).returning();
        if (!r) throw new InventoryError("Stock item not found");
        return r;
      }
      const [r] = await tx.insert(t.stockItem).values({ ...values, tenantId: venue.tenantId, venueId: venue.id }).returning();
      return r;
    } catch (e) {
      if (/stock_item_venue_name|unique/i.test(String((e as { cause?: Error }).cause?.message ?? e))) throw new InventoryError("You already have a stock item with that name");
      throw e;
    }
  });
}

/** Menu items with their recipes, cost per serving and gross profit. */
export async function recipes(venue: Venue) {
  return withTenant(venue.tenantId, async (tx) => {
    const items = await tx.select().from(t.menuItem).where(eq(t.menuItem.venueId, venue.id)).orderBy(asc(t.menuItem.station), asc(t.menuItem.sort));
    const lines = await tx.select().from(t.recipeLine).where(eq(t.recipeLine.venueId, venue.id));
    const stock = new Map((await tx.select().from(t.stockItem).where(eq(t.stockItem.venueId, venue.id))).map((s) => [s.id, s]));
    return items.map((m) => {
      const ls = lines.filter((l) => l.menuItemId === m.id && stock.has(l.stockItemId)).map((l) => ({ ...l, item: stock.get(l.stockItemId)! }));
      const cost = recipeCost(ls.map((l) => ({ qty: l.qty, packSize: l.item.packSize, packCostCents: l.item.packCostCents })));
      return { menuItem: m, lines: ls, ...grossProfit(m.priceCents, m.vatRate, cost), hasRecipe: ls.length > 0 };
    });
  });
}

export async function setRecipe(venue: Venue, menuItemId: string, lines: { stockItemId: string; qty: number }[]) {
  const clean = lines.filter((l) => l.stockItemId && Number(l.qty) > 0).map((l) => ({ stockItemId: l.stockItemId, qty: posInt(l.qty, "Amount", 1_000_000) }));
  if (new Set(clean.map((l) => l.stockItemId)).size !== clean.length) throw new InventoryError("Each ingredient once, please");
  await withTenant(venue.tenantId, async (tx) => {
    const [m] = await tx.select().from(t.menuItem).where(and(eq(t.menuItem.id, menuItemId), eq(t.menuItem.venueId, venue.id)));
    if (!m) throw new InventoryError("Menu item not found");
    if (clean.length) {
      const ok = await tx.select({ id: t.stockItem.id }).from(t.stockItem).where(and(eq(t.stockItem.venueId, venue.id), inArray(t.stockItem.id, clean.map((l) => l.stockItemId))));
      if (ok.length !== clean.length) throw new InventoryError("Stock item not found");
    }
    await tx.delete(t.recipeLine).where(eq(t.recipeLine.menuItemId, menuItemId));
    if (clean.length) await tx.insert(t.recipeLine).values(clean.map((l) => ({ ...l, tenantId: venue.tenantId, venueId: venue.id, menuItemId })));
  });
}

export async function setAutoSoldOut(venue: Venue, on: boolean) {
  await withTenant(venue.tenantId, async (tx) => {
    await tx.update(t.venue).set({ autoSoldOut: on }).where(eq(t.venue.id, venue.id));
    if (on) await syncSoldOut(tx, venue.id, null);
    else {
      await tx.update(t.menuItem).set({ soldOut: false, soldOutByStock: false }).where(and(eq(t.menuItem.venueId, venue.id), eq(t.menuItem.soldOutByStock, true)));
      await publish(tx, topics.venue(venue.id), { kind: "menu" });
    }
  });
}

/**
 * When the venue has it switched on: items whose ingredients have run out go sold out,
 * and items sold out by stock come back once there's enough. Staff sold-out toggles are left alone.
 */
async function syncSoldOut(tx: Tx, venueId: string, stockItemIds: string[] | null) {
  const [v] = await tx.select({ auto: t.venue.autoSoldOut }).from(t.venue).where(eq(t.venue.id, venueId));
  if (!v?.auto) return;
  const lines = await tx
    .select()
    .from(t.recipeLine)
    .where(stockItemIds ? and(eq(t.recipeLine.venueId, venueId), inArray(t.recipeLine.stockItemId, stockItemIds.length ? stockItemIds : ["00000000-0000-0000-0000-000000000000"])) : eq(t.recipeLine.venueId, venueId));
  const menuIds = [...new Set(lines.map((l) => l.menuItemId))];
  if (!menuIds.length) return;
  const all = await tx.select().from(t.recipeLine).where(inArray(t.recipeLine.menuItemId, menuIds));
  const oh = await onHandMap(tx, venueId, [...new Set(all.map((l) => l.stockItemId))]);
  const items = await tx.select().from(t.menuItem).where(inArray(t.menuItem.id, menuIds));
  let changed = false;
  for (const m of items) {
    const short = all.filter((l) => l.menuItemId === m.id).some((l) => (oh.get(l.stockItemId) ?? 0) < l.qty);
    if (short && !m.soldOut) {
      await tx.update(t.menuItem).set({ soldOut: true, soldOutByStock: true }).where(eq(t.menuItem.id, m.id));
      changed = true;
    } else if (!short && m.soldOut && m.soldOutByStock) {
      await tx.update(t.menuItem).set({ soldOut: false, soldOutByStock: false }).where(eq(t.menuItem.id, m.id));
      changed = true;
    }
  }
  if (changed) await publish(tx, topics.venue(venueId), { kind: "menu" });
}

// ---------------------------------------------------------------- movements

async function insertMovements(tx: Tx, rows: (typeof t.stockMovement.$inferInsert)[]) {
  if (rows.length) await tx.insert(t.stockMovement).values(rows);
}

/** Called when an order is paid (inside its transaction): take each recipe out of stock. */
export async function depleteForOrder(tx: Tx, tenantId: string, venueId: string, orderId: string) {
  const lines = await tx.select().from(t.orderLine).where(eq(t.orderLine.orderId, orderId));
  if (!lines.length) return;
  const recipe = await tx.select().from(t.recipeLine).where(inArray(t.recipeLine.menuItemId, lines.map((l) => l.menuItemId)));
  if (!recipe.length) return;
  const stock = new Map((await tx.select().from(t.stockItem).where(inArray(t.stockItem.id, [...new Set(recipe.map((r) => r.stockItemId))]))).map((s) => [s.id, s]));
  const rows = lines.flatMap((l) =>
    recipe
      .filter((r) => r.menuItemId === l.menuItemId)
      .map((r) => {
        const s = stock.get(r.stockItemId)!;
        const qty = -r.qty * l.qty;
        return { tenantId, venueId, stockItemId: r.stockItemId, kind: "sale" as const, qty, costCents: valueAtCost(qty, s.packSize, s.packCostCents), orderId, menuItemId: l.menuItemId };
      }),
  );
  await insertMovements(tx, rows);
  await syncSoldOut(tx, venueId, [...stock.keys()]);
}

/** Called when an order is refunded before it was served: put its stock back. */
export async function restockForOrder(tx: Tx, tenantId: string, venueId: string, orderId: string) {
  const sold = await tx.select().from(t.stockMovement).where(and(eq(t.stockMovement.orderId, orderId), eq(t.stockMovement.kind, "sale")));
  const already = await tx.select({ id: t.stockMovement.id }).from(t.stockMovement).where(and(eq(t.stockMovement.orderId, orderId), eq(t.stockMovement.kind, "refund")));
  if (!sold.length || already.length) return;
  await insertMovements(
    tx,
    sold.map((m) => ({ tenantId, venueId, stockItemId: m.stockItemId, kind: "refund" as const, qty: -m.qty, costCents: -m.costCents, orderId, menuItemId: m.menuItemId, reason: "order refunded" })),
  );
  await syncSoldOut(tx, venueId, sold.map((m) => m.stockItemId));
}

async function itemsFor(tx: Tx, venue: Venue, ids: string[]) {
  const rows = ids.length ? await tx.select().from(t.stockItem).where(and(eq(t.stockItem.venueId, venue.id), inArray(t.stockItem.id, ids))) : [];
  const m = new Map(rows.map((r) => [r.id, r]));
  if (new Set(ids).size !== m.size) throw new InventoryError("Stock item not found");
  return m;
}

/** A delivery from a supplier: adds stock and updates each item's latest pack price. */
export async function recordDelivery(
  venue: Venue,
  staff: Staff,
  input: { supplierId?: string | null; reference?: string; purchaseOrderId?: string | null; lines: { stockItemId: string; packs: number; packCostCents: number }[] },
) {
  const lines = input.lines.filter((l) => Number(l.packs) > 0).map((l) => ({ stockItemId: l.stockItemId, packs: posInt(l.packs, "Packs", 100_000), packCostCents: posInt(l.packCostCents, "Pack price") }));
  if (!lines.length) throw new InventoryError("Add at least one item to the delivery");
  return withTenant(venue.tenantId, async (tx) => {
    const items = await itemsFor(tx, venue, lines.map((l) => l.stockItemId));
    const total = lines.reduce((s, l) => s + l.packs * l.packCostCents, 0);
    const [d] = await tx
      .insert(t.delivery)
      .values({ tenantId: venue.tenantId, venueId: venue.id, supplierId: input.supplierId || null, reference: String(input.reference ?? "").slice(0, 80), totalCents: total, staffId: staff.id, purchaseOrderId: input.purchaseOrderId ?? null })
      .returning();
    for (const l of lines) await tx.update(t.stockItem).set({ packCostCents: l.packCostCents }).where(eq(t.stockItem.id, l.stockItemId));
    await insertMovements(
      tx,
      lines.map((l) => ({ tenantId: venue.tenantId, venueId: venue.id, stockItemId: l.stockItemId, kind: "delivery" as const, qty: l.packs * items.get(l.stockItemId)!.packSize, costCents: l.packs * l.packCostCents, refId: d.id, staffId: staff.id })),
    );
    await syncSoldOut(tx, venue.id, lines.map((l) => l.stockItemId));
    return d;
  });
}

/** Waste: either an amount of one stock item, or servings of a menu item (its recipe). */
export async function recordWaste(venue: Venue, staff: Staff, input: { stockItemId?: string; qty?: number; menuItemId?: string; servings?: number; reason: string }) {
  const reason = (WASTE_REASONS as readonly string[]).includes(input.reason) ? input.reason : null;
  if (!reason) throw new InventoryError("Choose a reason");
  await withTenant(venue.tenantId, async (tx) => {
    let rows: { stockItemId: string; qty: number; menuItemId?: string }[];
    if (input.menuItemId) {
      const servings = posInt(input.servings, "Servings", 1000);
      if (servings < 1) throw new InventoryError("How many were wasted?");
      const [m] = await tx.select().from(t.menuItem).where(and(eq(t.menuItem.id, input.menuItemId), eq(t.menuItem.venueId, venue.id)));
      if (!m) throw new InventoryError("Menu item not found");
      const recipe = await tx.select().from(t.recipeLine).where(eq(t.recipeLine.menuItemId, m.id));
      if (!recipe.length) throw new InventoryError(`${m.name} has no recipe yet. Ask a manager to add one under Stock → Recipes.`);
      rows = recipe.map((r) => ({ stockItemId: r.stockItemId, qty: r.qty * servings, menuItemId: m.id }));
    } else {
      const qty = posInt(input.qty, "Amount");
      if (!input.stockItemId || qty < 1) throw new InventoryError("Choose an item and amount");
      rows = [{ stockItemId: input.stockItemId, qty }];
    }
    const items = await itemsFor(tx, venue, [...new Set(rows.map((r) => r.stockItemId))]);
    await insertMovements(
      tx,
      rows.map((r) => {
        const s = items.get(r.stockItemId)!;
        return { tenantId: venue.tenantId, venueId: venue.id, stockItemId: r.stockItemId, kind: "waste" as const, qty: -r.qty, costCents: valueAtCost(-r.qty, s.packSize, s.packCostCents), reason, menuItemId: r.menuItemId ?? null, staffId: staff.id };
      }),
    );
    await syncSoldOut(tx, venue.id, rows.map((r) => r.stockItemId));
  });
}

/** A stock count: the difference from what the ledger expected is recorded as a correction (the unexplained loss or gain). */
export async function recordCount(venue: Venue, staff: Staff, counts: { stockItemId: string; counted: number }[]) {
  const clean = counts.filter((c) => c.counted !== null && c.counted !== undefined && !Number.isNaN(Number(c.counted))).map((c) => ({ stockItemId: c.stockItemId, counted: posInt(c.counted, "Counted amount") }));
  if (!clean.length) throw new InventoryError("Enter at least one counted amount");
  return withTenant(venue.tenantId, async (tx) => {
    const items = await itemsFor(tx, venue, clean.map((c) => c.stockItemId));
    const oh = await onHandMap(tx, venue.id, clean.map((c) => c.stockItemId));
    const lines = clean.map((c) => {
      const s = items.get(c.stockItemId)!;
      const expected = oh.get(c.stockItemId) ?? 0;
      return { stockItemId: s.id, name: s.name, unit: s.unit, expected, counted: c.counted, diffCents: valueAtCost(c.counted - expected, s.packSize, s.packCostCents) };
    });
    const valueCents = clean.reduce((sum, c) => {
      const s = items.get(c.stockItemId)!;
      return sum + valueAtCost(c.counted, s.packSize, s.packCostCents);
    }, 0);
    const [count] = await tx
      .insert(t.stockCount)
      .values({ tenantId: venue.tenantId, venueId: venue.id, staffId: staff.id, lines, valueCents, varianceCents: lines.reduce((s, l) => s + l.diffCents, 0) })
      .returning();
    await insertMovements(
      tx,
      lines
        .filter((l) => l.counted !== l.expected)
        .map((l) => ({ tenantId: venue.tenantId, venueId: venue.id, stockItemId: l.stockItemId, kind: "count" as const, qty: l.counted - l.expected, costCents: l.diffCents, refId: count.id, staffId: staff.id, reason: "stock count" })),
    );
    await syncSoldOut(tx, venue.id, clean.map((c) => c.stockItemId));
    return count;
  });
}

export async function recentCounts(venue: Venue, limit = 10) {
  return withTenant(venue.tenantId, (tx) => tx.select().from(t.stockCount).where(eq(t.stockCount.venueId, venue.id)).orderBy(desc(t.stockCount.countedAt)).limit(limit));
}

export async function recentDeliveries(venue: Venue, limit = 15) {
  return withTenant(venue.tenantId, async (tx) => {
    const rows = await tx.select().from(t.delivery).where(eq(t.delivery.venueId, venue.id)).orderBy(desc(t.delivery.receivedAt)).limit(limit);
    const sups = new Map((await tx.select().from(t.supplier).where(eq(t.supplier.venueId, venue.id))).map((s) => [s.id, s.name]));
    return rows.map((d) => ({ ...d, supplierName: d.supplierId ? (sups.get(d.supplierId) ?? "") : "" }));
  });
}

// ---------------------------------------------------------------- till sales

/**
 * Counter sales from the till (one CSV per trading day) take stock out through the same recipes.
 * Importing the same day again replaces the earlier import, so nothing is counted twice.
 */
export async function importTillSales(venue: Venue, staff: Staff, businessDate: string, rows: { name: string; qty: number }[]) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) throw new InventoryError("Choose the trading day");
  return withTenant(venue.tenantId, async (tx) => {
    const menu = await tx.select().from(t.menuItem).where(eq(t.menuItem.venueId, venue.id));
    const byName = new Map(menu.flatMap((m) => [[m.name.toLowerCase(), m] as const, ...(m.externalItemId ? [[m.externalItemId.toLowerCase(), m] as const] : [])]));
    const lines = rows.map((r) => ({ name: r.name, qty: r.qty, menuItemId: byName.get(r.name.trim().toLowerCase())?.id ?? null }));
    const [prev] = await tx.select().from(t.tillImport).where(and(eq(t.tillImport.venueId, venue.id), eq(t.tillImport.businessDate, businessDate)));
    if (prev) {
      await tx.delete(t.stockMovement).where(eq(t.stockMovement.refId, prev.id));
      await tx.delete(t.tillImport).where(eq(t.tillImport.id, prev.id));
    }
    const [imp] = await tx.insert(t.tillImport).values({ tenantId: venue.tenantId, venueId: venue.id, businessDate, lines, staffId: staff.id }).returning();
    const matched = lines.filter((l) => l.menuItemId);
    const recipe = matched.length ? await tx.select().from(t.recipeLine).where(inArray(t.recipeLine.menuItemId, matched.map((l) => l.menuItemId!))) : [];
    const stock = new Map((recipe.length ? await tx.select().from(t.stockItem).where(inArray(t.stockItem.id, [...new Set(recipe.map((r) => r.stockItemId))])) : []).map((s) => [s.id, s]));
    const at = new Date(`${businessDate}T23:00:00Z`);
    await insertMovements(
      tx,
      matched.flatMap((l) =>
        recipe
          .filter((r) => r.menuItemId === l.menuItemId)
          .map((r) => {
            const s = stock.get(r.stockItemId)!;
            const qty = -r.qty * l.qty;
            return { tenantId: venue.tenantId, venueId: venue.id, stockItemId: r.stockItemId, kind: "till_sale" as const, qty, costCents: valueAtCost(qty, s.packSize, s.packCostCents), menuItemId: l.menuItemId, refId: imp.id, staffId: staff.id, createdAt: at };
          }),
      ),
    );
    await syncSoldOut(tx, venue.id, [...stock.keys()]);
    return { matched: matched.length, unmatched: lines.filter((l) => !l.menuItemId).map((l) => l.name), replaced: !!prev };
  });
}

// ---------------------------------------------------------------- purchase orders

/** What to order from each supplier to get every item back above its par level. */
export async function suggestedOrders(venue: Venue) {
  const { items, suppliers } = await stockLevels(venue);
  return suppliers
    .map((s) => ({
      supplier: s,
      lines: items
        .filter((i) => i.active && i.supplierId === s.id)
        .map((i) => ({ item: i, packs: packsToOrder(i.onHand, i.parLevel, i.packSize) }))
        .filter((l) => l.packs > 0),
    }))
    .filter((g) => g.lines.length);
}

export async function createPurchaseOrder(venue: Venue, supplierId: string, lines: { stockItemId: string; packs: number }[]) {
  const clean = lines.map((l) => ({ stockItemId: l.stockItemId, packs: posInt(l.packs, "Packs", 10_000) })).filter((l) => l.packs > 0);
  if (!clean.length) throw new InventoryError("Nothing to order");
  return withTenant(venue.tenantId, async (tx) => {
    const [s] = await tx.select().from(t.supplier).where(and(eq(t.supplier.id, supplierId), eq(t.supplier.venueId, venue.id)));
    if (!s) throw new InventoryError("Supplier not found");
    const items = await itemsFor(tx, venue, clean.map((l) => l.stockItemId));
    const ls = clean.map((l) => {
      const i = items.get(l.stockItemId)!;
      return { stockItemId: i.id, name: i.name, packs: l.packs, packName: i.packName, packCostCents: i.packCostCents };
    });
    const [po] = await tx
      .insert(t.purchaseOrder)
      .values({ tenantId: venue.tenantId, venueId: venue.id, supplierId, lines: ls, totalCents: ls.reduce((a, l) => a + l.packs * l.packCostCents, 0) })
      .returning();
    return po;
  });
}

export async function purchaseOrders(venue: Venue) {
  return withTenant(venue.tenantId, async (tx) => {
    const rows = await tx.select().from(t.purchaseOrder).where(eq(t.purchaseOrder.venueId, venue.id)).orderBy(desc(t.purchaseOrder.createdAt)).limit(30);
    const sups = new Map((await tx.select().from(t.supplier).where(eq(t.supplier.venueId, venue.id))).map((s) => [s.id, s]));
    return rows.map((p) => ({ ...p, supplier: sups.get(p.supplierId)! }));
  });
}

export async function setPurchaseOrderStatus(venue: Venue, poId: string, status: "sent" | "cancelled") {
  await withTenant(venue.tenantId, async (tx) => {
    const r = await tx
      .update(t.purchaseOrder)
      .set({ status, ...(status === "sent" ? { sentAt: new Date() } : {}) })
      .where(and(eq(t.purchaseOrder.id, poId), eq(t.purchaseOrder.venueId, venue.id), inArray(t.purchaseOrder.status, ["draft", "sent"])))
      .returning();
    if (!r.length) throw new InventoryError("Order not found");
  });
}

/** Goods arrived as ordered (prices as on the order): records the delivery and closes the order. */
export async function receivePurchaseOrder(venue: Venue, staff: Staff, poId: string) {
  const po = await withTenant(venue.tenantId, async (tx) => {
    const [p] = await tx.select().from(t.purchaseOrder).where(and(eq(t.purchaseOrder.id, poId), eq(t.purchaseOrder.venueId, venue.id)));
    if (!p || p.status === "received" || p.status === "cancelled") throw new InventoryError("This order can't be received");
    return p;
  });
  await recordDelivery(venue, staff, { supplierId: po.supplierId, reference: `PO ${po.id.slice(0, 8).toUpperCase()}`, purchaseOrderId: po.id, lines: po.lines });
  await withTenant(venue.tenantId, (tx) => tx.update(t.purchaseOrder).set({ status: "received" }).where(eq(t.purchaseOrder.id, po.id)));
}

// ---------------------------------------------------------------- reports

/** Profit by menu item (app + till sales), with menu engineering, waste and count variance for the period. */
export async function profitReport(venue: Venue, from: Date, to: Date) {
  const rs = await recipes(venue);
  return withTenant(venue.tenantId, async (tx) => {
    const app = await tx
      .select({
        id: t.orderLine.menuItemId,
        qty: sql<number>`sum(${t.orderLine.qty})::int`,
        gross: sql<number>`sum(${t.orderLine.grossCents})::int`,
        vat: sql<number>`sum(${t.orderLine.vatCents})::int`,
      })
      .from(t.orderLine)
      .innerJoin(t.orders, eq(t.orders.id, t.orderLine.orderId))
      .where(and(eq(t.orders.venueId, venue.id), eq(t.orders.status, "paid"), gte(t.orders.paidAt, from), lt(t.orders.paidAt, to)))
      .groupBy(t.orderLine.menuItemId);
    const fromDay = from.toISOString().slice(0, 10), toDay = to.toISOString().slice(0, 10);
    const tills = await tx
      .select()
      .from(t.tillImport)
      .where(and(eq(t.tillImport.venueId, venue.id), gte(t.tillImport.businessDate, fromDay), lt(t.tillImport.businessDate, toDay)));
    const tillQty = new Map<string, number>();
    for (const imp of tills) for (const l of imp.lines) if (l.menuItemId) tillQty.set(l.menuItemId, (tillQty.get(l.menuItemId) ?? 0) + l.qty);
    const losses = await tx
      .select({ kind: t.stockMovement.kind, cost: sql<number>`coalesce(sum(${t.stockMovement.costCents}),0)::int` })
      .from(t.stockMovement)
      .where(and(eq(t.stockMovement.venueId, venue.id), inArray(t.stockMovement.kind, ["waste", "count"]), gte(t.stockMovement.createdAt, from), lt(t.stockMovement.createdAt, to)))
      .groupBy(t.stockMovement.kind);
    const rows = rs.map((r) => {
      const a = app.find((x) => x.id === r.menuItem.id);
      const tq = tillQty.get(r.menuItem.id) ?? 0;
      const tillGross = tq * r.menuItem.priceCents;
      const qty = (a?.qty ?? 0) + tq;
      const netCents = (a ? a.gross - a.vat : 0) + (tillGross - vatFromGross(tillGross, r.menuItem.vatRate));
      const costCents = qty * r.costCents;
      return { id: r.menuItem.id, name: r.menuItem.name, station: r.menuItem.station, hasRecipe: r.hasRecipe, appQty: a?.qty ?? 0, tillQty: tq, qty, netCents, costCents, profitCents: netCents - costCents, gpCents: r.gpCents, gpPct: r.gpPct, unitCostCents: r.costCents };
    });
    const items = menuEngineering(rows).sort((x, y) => y.profitCents - x.profitCents);
    const netSales = items.reduce((s, i) => s + i.netCents, 0);
    const cogs = items.reduce((s, i) => s + i.costCents, 0);
    const wasteCents = -(losses.find((l) => l.kind === "waste")?.cost ?? 0);
    const varianceCents = losses.find((l) => l.kind === "count")?.cost ?? 0;
    const gp = netSales - cogs;
    return {
      items,
      totals: { netSales, cogs, gp, gpPct: netSales ? Math.round((gp / netSales) * 1000) / 10 : 0, wasteCents, varianceCents, profitAfterLosses: gp - wasteCents + varianceCents, missingRecipes: items.filter((i) => i.qty > 0 && !i.hasRecipe).length },
    };
  });
}

export async function wasteReport(venue: Venue, from: Date, to: Date) {
  return withTenant(venue.tenantId, async (tx) => {
    const rows = await tx
      .select({ m: t.stockMovement, item: t.stockItem })
      .from(t.stockMovement)
      .innerJoin(t.stockItem, eq(t.stockItem.id, t.stockMovement.stockItemId))
      .where(and(eq(t.stockMovement.venueId, venue.id), eq(t.stockMovement.kind, "waste"), gte(t.stockMovement.createdAt, from), lt(t.stockMovement.createdAt, to)))
      .orderBy(desc(t.stockMovement.createdAt));
    const sum = <K extends string>(key: (r: (typeof rows)[number]) => K) => {
      const m = new Map<K, number>();
      for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) - r.m.costCents);
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };
    return {
      totalCents: rows.reduce((s, r) => s - r.m.costCents, 0),
      byReason: sum((r) => r.m.reason ?? "Other"),
      byItem: sum((r) => r.item.name),
      recent: rows.slice(0, 25).map((r) => ({ id: r.m.id, at: r.m.createdAt, name: r.item.name, unit: r.item.unit, qty: -r.m.qty, costCents: -r.m.costCents, reason: r.m.reason })),
    };
  });
}

export type StockItemRow = Item;
