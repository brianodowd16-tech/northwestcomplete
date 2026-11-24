import { CartError, discountLines, localDate, priceCart, stationOpen, zonedToUtc } from "@round/core";
import { and, desc, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import { publish, topics, withTenant } from "./index";
import { depleteForOrder, restockForOrder } from "./inventory";
import * as t from "./schema";
import { Forbidden, toPriced, type Staff, type Venue } from "./services";

// The till: staff ring up counter sales, paid in cash or by card on the venue's myPOS terminal.
// Money goes straight to the venue (cash in the drawer, card into its own myPOS account).
// Till sales earn no loyalty and aren't part of Complete's 1% app fee.

export type TillMethod = "cash" | "card" | "room" | "tab";
export const TILL_REFUND_MINUTES = 15;

export async function ringUpSale(
  venue: Venue,
  staff: Staff,
  input: { key: string; lines: { menuItemId: string; qty: number }[]; method: TillMethod; tableNumber?: number | null; tenderedCents?: number | null; cardRef?: string | null; roomNumber?: string | null; discountCents?: number; discountReason?: string | null; tabId?: string | null; tabName?: string | null },
) {
  if (staff.venueId !== venue.id) throw new Forbidden("Not your venue");
  if (!["cash", "card", "room", "tab"].includes(input.method)) throw new CartError("Choose cash, card, room or tab");
  const room = input.method === "room" ? String(input.roomNumber ?? "").trim().slice(0, 12) : null;
  if (input.method === "room" && (venue.kind !== "hotel" || !/^[A-Za-z0-9-]{1,12}$/.test(room ?? ""))) throw new CartError(venue.kind === "hotel" ? "Enter the room number" : "Room charges are for hotels");
  if (!/^[A-Za-z0-9-]{8,64}$/.test(input.key ?? "")) throw new CartError("Missing sale key");
  return withTenant(venue.tenantId, async (tx) => {
    const idem = `till:${input.key}`;
    const [dup] = await tx.select().from(t.orders).where(eq(t.orders.idempotencyKey, idem));
    if (dup) return { order: dup, changeCents: Math.max(0, (input.tenderedCents ?? dup.amountPaidCents) - dup.amountPaidCents), repeat: true };
    const items = await tx.select().from(t.menuItem).where(eq(t.menuItem.venueId, venue.id));
    const priced = priceCart(new Map(items.map((i) => [i.id, toPriced(i)])), input.lines, "counter");
    const food = priced.lines.some((l) => l.menuItem.station === "kitchen");
    if (food) {
      const k = stationOpen(venue.hours, null, "kitchen", new Date(), venue.timezone);
      if (!k.open) throw new CartError(k.reason ?? "The kitchen is closed");
    }
    // Discounts and comps: a reason always; over 20% (or a full comp) needs a manager.
    const discount = Math.max(0, Math.round(input.discountCents ?? 0));
    if (discount > 0) {
      if (!String(input.discountReason ?? "").trim()) throw new CartError("Give a reason for the discount");
      if (staff.role !== "admin" && discount > priced.grossCents * 0.2) throw new Forbidden("Discounts over 20% need a manager");
    }
    // No discounts on alcohol (Irish law bars below-price alcohol promotions): only non-alcohol lines can be discounted.
    // A replaced drink (bad pint) is logged as waste instead.
    const discountable = priced.lines.filter((l) => !l.menuItem.containsAlcohol);
    if (discount > discountable.reduce((s, l) => s + l.grossCents, 0))
      throw new CartError(discountable.length ? "Discounts can only cover the food and soft drinks on this bill, not alcohol" : "Alcohol can't be discounted or comped. Log a replaced drink as waste instead.");
    const discounted = discount ? discountLines(discountable, discount) : discountable;
    const lines = priced.lines.map((l) => discounted.find((d) => d.menuItem.id === l.menuItem.id) ?? l);
    const cart = {
      lines,
      grossCents: lines.reduce((s, l) => s + l.grossCents, 0),
      vat9Cents: lines.filter((l) => l.vatRate === 9).reduce((s, l) => s + l.vatCents, 0),
      vat23Cents: lines.filter((l) => l.vatRate === 23).reduce((s, l) => s + l.vatCents, 0),
    };
    // A tab: rung up now (dockets, stock) and paid when the tab closes.
    let tabId: string | null = null;
    if (input.method === "tab") {
      if (input.tabId) {
        const [tb] = await tx.select().from(t.tab).where(and(eq(t.tab.id, input.tabId), eq(t.tab.venueId, venue.id), isNull(t.tab.closedAt)));
        if (!tb) throw new CartError("That tab is closed");
        tabId = tb.id;
      } else {
        const name = String(input.tabName ?? "").trim().slice(0, 40);
        if (!name) throw new CartError("Give the tab a name");
        const [tb] = await tx.insert(t.tab).values({ tenantId: venue.tenantId, venueId: venue.id, name, tableNumber: input.tableNumber ? Number(input.tableNumber) : null, openedBy: staff.id }).returning();
        tabId = tb.id;
      }
    }
    const table = input.tableNumber ? Number(input.tableNumber) : null;
    if (food && (!table || !Number.isInteger(table) || table < 1 || table > 500)) throw new CartError("Food is brought to the table: enter the table number");
    if (input.method === "cash" && input.tenderedCents != null && input.tenderedCents < cart.grossCents) throw new CartError("Not enough cash tendered");
    const [order] = await tx
      .insert(t.orders)
      .values({
        tenantId: venue.tenantId,
        venueId: venue.id,
        channel: "counter",
        tableId: null,
        tableNumber: food ? table : null,
        customerId: null,
        membershipId: null,
        staffId: staff.id,
        status: input.method === "tab" ? "open" : "paid",
        tabId,
        discountCents: discount,
        discountReason: discount ? String(input.discountReason).trim().slice(0, 120) : null,
        grossCents: cart.grossCents,
        vat9Cents: cart.vat9Cents,
        vat23Cents: cart.vat23Cents,
        creditUsedCents: 0,
        amountPaidCents: cart.grossCents,
        provider: input.method === "cash" ? "cash" : input.method === "room" ? "room" : input.method === "tab" ? "tab" : "mypos_terminal",
        roomNumber: room,
        providerTxnRef: input.method === "card" ? String(input.cardRef ?? "").slice(0, 64) || null : null,
        idempotencyKey: idem,
        paidAt: input.method === "tab" ? null : new Date(),
      })
      .returning();
    await tx.insert(t.orderLine).values(
      cart.lines.map((l) => ({
        tenantId: venue.tenantId,
        orderId: order.id,
        menuItemId: l.menuItem.id,
        name: l.menuItem.name,
        qty: l.qty,
        unitPriceCents: l.unitPriceCents,
        grossCents: l.grossCents,
        vatRate: l.vatRate,
        vatCents: l.vatCents,
        station: l.menuItem.station,
        containsAlcohol: l.menuItem.containsAlcohol,
      })),
    );
    // Drinks are handed over at the counter; food goes to the kitchen screen for the table.
    if (food) await tx.insert(t.docket).values({ tenantId: venue.tenantId, venueId: venue.id, orderId: order.id, station: "kitchen" });
    await depleteForOrder(tx, venue.tenantId, venue.id, order.id);
    await publish(tx, topics.venue(venue.id), { kind: "dockets" });
    return { order, changeCents: input.method === "cash" && input.tenderedCents ? input.tenderedCents - cart.grossCents : 0, repeat: false };
  });
}

/** Refund a till sale (cash from the drawer, or card on the terminal). Staff within 15 minutes; managers any time. */
export async function refundTillSale(venue: Venue, staff: Staff, orderId: string) {
  await withTenant(venue.tenantId, async (tx) => {
    const [o] = await tx.select().from(t.orders).where(and(eq(t.orders.id, orderId), eq(t.orders.venueId, venue.id)));
    if (!o || o.channel !== "counter" || (o.status !== "paid" && o.status !== "open")) throw new CartError("This sale can't be refunded");
    if (staff.role !== "admin" && Date.now() - (o.paidAt ?? o.createdAt).getTime() > TILL_REFUND_MINUTES * 60_000) throw new Forbidden("Ask a manager to refund sales older than 15 minutes");
    if (o.status === "open") await tx.update(t.orders).set({ status: "cancelled" }).where(eq(t.orders.id, o.id)); // not paid yet: just void it
    else await tx.update(t.orders).set({ status: "refunded", refundedCents: o.amountPaidCents, refundedAt: new Date() }).where(eq(t.orders.id, o.id));
    await tx.update(t.docket).set({ status: "done", doneAt: new Date() }).where(eq(t.docket.orderId, o.id));
    await restockForOrder(tx, venue.tenantId, venue.id, o.id);
    await tx.insert(t.auditLog).values({ tenantId: venue.tenantId, actor: `staff:${staff.id}`, action: "till_refund", entity: `order:${o.id}`, detail: { amountCents: o.amountPaidCents, method: o.provider } });
    await publish(tx, topics.venue(venue.id), { kind: "dockets" });
  });
}

export async function recentTillSales(venue: Venue, limit = 12) {
  return withTenant(venue.tenantId, async (tx) => {
    const os = await tx.select().from(t.orders).where(and(eq(t.orders.venueId, venue.id), eq(t.orders.channel, "counter"))).orderBy(desc(t.orders.createdAt)).limit(limit);
    const lines = os.length ? await tx.select().from(t.orderLine).where(inArray(t.orderLine.orderId, os.map((o) => o.id))) : [];
    return os.map((o) => ({ ...o, lines: lines.filter((l) => l.orderId === o.id) }));
  });
}

/** End-of-day (Z) report for one trading day: till sales by payment method, VAT, staff and item, plus app orders. */
export async function dayReport(venue: Venue, date: string) {
  const from = zonedToUtc(`${date}T00:00`, venue.timezone);
  const to = zonedToUtc(`${localDate(new Date(from.getTime() + 30 * 3600_000), venue.timezone)}T00:00`, venue.timezone);
  return withTenant(venue.tenantId, async (tx) => {
    const os = await tx.select().from(t.orders).where(and(eq(t.orders.venueId, venue.id), inArray(t.orders.status, ["paid", "refunded"]), gte(t.orders.paidAt, from), lt(t.orders.paidAt, to)));
    const lines = os.length ? await tx.select().from(t.orderLine).where(inArray(t.orderLine.orderId, os.map((o) => o.id))) : [];
    const staff = new Map((await tx.select({ id: t.staffUser.id, name: t.staffUser.name }).from(t.staffUser).where(eq(t.staffUser.venueId, venue.id))).map((s) => [s.id, s.name]));
    const till = os.filter((o) => o.channel === "counter"), app = os.filter((o) => o.channel !== "counter");
    const kept = (o: (typeof os)[number]) => o.status === "paid";
    const sum = (xs: typeof os, f: (o: (typeof os)[number]) => number) => xs.reduce((s, o) => s + f(o), 0);
    const byStaff = new Map<string, { name: string; sales: number; cents: number }>();
    for (const o of till.filter(kept)) {
      const k = o.staffId ?? "";
      const cur = byStaff.get(k) ?? { name: staff.get(k) ?? "Unknown", sales: 0, cents: 0 };
      byStaff.set(k, { ...cur, sales: cur.sales + 1, cents: cur.cents + o.amountPaidCents });
    }
    const items = new Map<string, { qty: number; cents: number }>();
    for (const l of lines.filter((l) => till.find((o) => o.id === l.orderId && kept(o)))) {
      const cur = items.get(l.name) ?? { qty: 0, cents: 0 };
      items.set(l.name, { qty: cur.qty + l.qty, cents: cur.cents + l.grossCents });
    }
    return {
      date,
      till: {
        sales: till.filter(kept).length,
        grossCents: sum(till.filter(kept), (o) => o.amountPaidCents),
        cashCents: sum(till.filter((o) => kept(o) && o.provider === "cash"), (o) => o.amountPaidCents),
        cardCents: sum(till.filter((o) => kept(o) && o.provider === "mypos_terminal"), (o) => o.amountPaidCents),
        roomCents: sum(till.filter((o) => kept(o) && o.provider === "room"), (o) => o.amountPaidCents),
        vat9Cents: sum(till.filter(kept), (o) => o.vat9Cents),
        vat23Cents: sum(till.filter(kept), (o) => o.vat23Cents),
        cashRefundedCents: sum(till.filter((o) => o.status === "refunded" && o.provider === "cash"), (o) => o.amountPaidCents),
        discountCents: sum(till.filter(kept), (o) => o.discountCents),
        refunds: till.filter((o) => o.status === "refunded").length,
        refundedCents: sum(till.filter((o) => o.status === "refunded"), (o) => o.amountPaidCents),
      },
      app: { orders: app.filter(kept).length, grossCents: sum(app.filter(kept), (o) => o.grossCents), paidCents: sum(app.filter(kept), (o) => o.amountPaidCents), tipsCents: sum(app.filter(kept), (o) => o.tipCents) },
      byStaff: [...byStaff.values()].sort((a, b) => b.cents - a.cents),
      topItems: [...items.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.qty - a.qty).slice(0, 10),
    };
  });
}

// ---------------------------------------------------------------- tabs

export async function openTabs(venue: Venue) {
  return withTenant(venue.tenantId, async (tx) => {
    const tabs = await tx.select().from(t.tab).where(and(eq(t.tab.venueId, venue.id), isNull(t.tab.closedAt))).orderBy(t.tab.openedAt);
    const os = tabs.length ? await tx.select().from(t.orders).where(and(inArray(t.orders.tabId, tabs.map((x) => x.id)), eq(t.orders.status, "open"))) : [];
    return tabs.map((x) => ({ ...x, totalCents: os.filter((o) => o.tabId === x.id).reduce((s, o) => s + o.amountPaidCents, 0), rounds: os.filter((o) => o.tabId === x.id).length }));
  });
}

/** Settles a tab: every open round on it is paid at once by cash, card or room. */
export async function closeTab(venue: Venue, staff: Staff, tabId: string, input: { method: "cash" | "card" | "room"; tenderedCents?: number | null; roomNumber?: string | null }) {
  if (staff.venueId !== venue.id) throw new Forbidden("Not your venue");
  return withTenant(venue.tenantId, async (tx) => {
    const [tb] = await tx.select().from(t.tab).where(and(eq(t.tab.id, tabId), eq(t.tab.venueId, venue.id), isNull(t.tab.closedAt))).for("update");
    if (!tb) throw new CartError("That tab is already closed");
    const os = await tx.select().from(t.orders).where(and(eq(t.orders.tabId, tb.id), eq(t.orders.status, "open")));
    const total = os.reduce((s, o) => s + o.amountPaidCents, 0);
    if (input.method === "cash" && input.tenderedCents != null && input.tenderedCents < total) throw new CartError("Not enough cash tendered");
    const room = input.method === "room" ? String(input.roomNumber ?? "").trim() : null;
    if (input.method === "room" && (venue.kind !== "hotel" || !/^[A-Za-z0-9-]{1,12}$/.test(room ?? ""))) throw new CartError("Enter the room number");
    const provider = input.method === "cash" ? "cash" : input.method === "room" ? "room" : "mypos_terminal";
    if (os.length) await tx.update(t.orders).set({ status: "paid", paidAt: new Date(), provider, roomNumber: room }).where(inArray(t.orders.id, os.map((o) => o.id)));
    await tx.update(t.tab).set({ closedAt: new Date(), method: input.method }).where(eq(t.tab.id, tb.id));
    return { totalCents: total, changeCents: input.method === "cash" && input.tenderedCents ? input.tenderedCents - total : 0, rounds: os.length };
  });
}

// ---------------------------------------------------------------- cash-up

/** End of night: count the drawer against what the till says should be there. */
export async function recordCashUp(venue: Venue, staff: Staff, date: string, input: { floatCents: number; countedCents: number; note?: string }) {
  const r = await dayReport(venue, date);
  const expected = input.floatCents + r.till.cashCents - r.till.cashRefundedCents;
  return withTenant(venue.tenantId, async (tx) => {
    const [row] = await tx
      .insert(t.cashUp)
      .values({ tenantId: venue.tenantId, venueId: venue.id, businessDate: date, staffId: staff.id, floatCents: input.floatCents, expectedCents: expected, countedCents: input.countedCents, varianceCents: input.countedCents - expected, note: String(input.note ?? "").slice(0, 200) })
      .returning();
    return row;
  });
}

export async function cashUps(venue: Venue, date: string) {
  return withTenant(venue.tenantId, (tx) => tx.select().from(t.cashUp).where(and(eq(t.cashUp.venueId, venue.id), eq(t.cashUp.businessDate, date))).orderBy(desc(t.cashUp.createdAt)));
}
