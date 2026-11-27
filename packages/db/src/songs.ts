import { CartError, spotifyLink, vatFromGross } from "@round/core";
import type { PaymentProvider } from "@round/core";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { publish, systemDb as db, topics, withTenant } from "./index";
import { reverseWalletTx, spendWalletTx } from "./wallet";
import * as t from "./schema";
import { completeOrder, Forbidden, NotFound, ensureMembership, startCheckout, type Customer, type Staff, type Venue } from "./services";

/** Most a venue can charge for one song request, in cents. */
export const MAX_SONG_CENTS = 2000;

/** Sets the price of a paid song request (null turns paid requests off). */
export async function setSongPrice(venue: Venue, cents: number | null) {
  if (cents !== null && (!Number.isInteger(cents) || cents < 50 || cents > MAX_SONG_CENTS)) throw new CartError("Song requests cost between €0.50 and €20");
  await withTenant(venue.tenantId, (tx) => tx.update(t.venue).set({ songRequestCents: cents }).where(eq(t.venue.id, venue.id)));
}

/**
 * A guest pays the venue for a song request. Paid through the venue's own checkout like any order;
 * on the verified payment notification it lands on the bar's queue (see completeOrder). Earns no loyalty.
 */
export async function requestPaidSong(venue: Venue, customer: Customer, input: { title: string; link?: string; idempotencyKey: string; useWallet?: boolean }, provider: PaymentProvider, appUrl: string) {
  if (venue.status === "suspended") throw new Forbidden(`${venue.name} isn't taking requests right now`);
  const price = venue.songRequestCents;
  if (!price) throw new Forbidden(`${venue.name} isn't taking paid song requests`);
  const title = String(input.title ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  if (title.length < 2) throw new CartError("Which song?");
  const link = input.link?.trim() ? spotifyLink(input.link) : null;
  if (input.link?.trim() && link?.kind !== "track") throw new CartError("Paste a Spotify song link, or just type the song");
  const key = `song:${String(input.idempotencyKey ?? "").slice(0, 80)}`;
  if (key.length < 12) throw new CartError("Missing request key");
  const m = await ensureMembership(venue, customer.id);

  const order = await withTenant(venue.tenantId, async (tx) => {
    const [dupe] = await tx.select().from(t.orders).where(eq(t.orders.idempotencyKey, key));
    if (dupe) return dupe;
    const recent = await tx.select({ id: t.songRequest.id }).from(t.songRequest).where(and(eq(t.songRequest.customerId, customer.id), eq(t.songRequest.venueId, venue.id), gte(t.songRequest.createdAt, new Date(Date.now() - 30 * 60_000))));
    if (recent.length >= 3) throw new CartError("Three requests every half hour, so everyone gets a go");
    const vat = vatFromGross(price, 23);
    const [o] = await tx
      .insert(t.orders)
      .values({
        tenantId: venue.tenantId, venueId: venue.id, channel: "collect", customerId: customer.id, membershipId: m.id, status: "pending_payment",
        grossCents: price, vat9Cents: 0, vat23Cents: vat, amountPaidCents: price, rewardableCents: 0, provider: provider.name, idempotencyKey: key,
      })
      .returning();
    await tx.insert(t.orderLine).values({ tenantId: venue.tenantId, orderId: o.id, menuItemId: null, name: `Song request: ${title}`.slice(0, 140), qty: 1, unitPriceCents: price, grossCents: price, vatRate: 23, vatCents: vat, station: "bar", containsAlcohol: false });
    await tx.insert(t.songRequest).values({ tenantId: venue.tenantId, venueId: venue.id, customerId: customer.id, title, link: link?.url ?? null, status: "pending_payment", orderId: o.id });
    if (input.useWallet) {
      const w = await spendWalletTx(tx, { customerId: customer.id, venueId: venue.id, orderId: o.id, dueCents: price, nonAlcoholDueCents: price });
      if (w.totalCents) return (await tx.update(t.orders).set({ walletPaidCents: w.paidCents, walletBonusCents: w.bonusCents, amountPaidCents: price - w.totalCents }).where(eq(t.orders.id, o.id)).returning())[0];
    }
    return o;
  });
  if (order.status !== "pending_payment") return { order, checkout: null };
  if (order.amountPaidCents === 0) {
    await completeOrder(venue.tenantId, order.id); // paid in full with points
    return { order, checkout: null };
  }
  // A repeated request reuses its widget token; hosted checkouts rebuild their form.
  if (order.providerToken) return { order, checkout: { provider: provider.name, token: order.providerToken, publicKey: provider.publicKey, redirect: null } };
  return startCheckout(venue, customer, order, provider, appUrl);
}

/** The bar's song list: paid and free requests waiting, the queue in order, and what was played tonight. */
export async function songQueue(staff: Staff) {
  const [v] = await db().select().from(t.venue).where(eq(t.venue.id, staff.venueId));
  const rows = await withTenant(v.tenantId, (tx) =>
    tx
      .select({ s: t.songRequest, paid: t.orders.amountPaidCents })
      .from(t.songRequest)
      .leftJoin(t.orders, eq(t.orders.id, t.songRequest.orderId))
      .where(and(eq(t.songRequest.venueId, v.id), inArray(t.songRequest.status, ["requested", "queued", "played", "declined", "refunded"]), gte(t.songRequest.createdAt, new Date(Date.now() - 12 * 3_600_000))))
      .orderBy(asc(t.songRequest.queuedAt), desc(t.songRequest.createdAt))
      .limit(100),
  );
  const all = rows.map((r) => ({ ...r.s, paidCents: r.s.orderId ? r.paid ?? 0 : 0 }));
  return {
    waiting: all.filter((s) => s.status === "requested").sort((a, b) => b.paidCents - a.paidCents || a.createdAt.getTime() - b.createdAt.getTime()),
    queue: all.filter((s) => s.status === "queued"),
    done: all.filter((s) => ["played", "declined", "refunded"].includes(s.status)).slice(0, 20),
  };
}

async function songForStaff(staff: Staff, id: string) {
  const [v] = await db().select().from(t.venue).where(eq(t.venue.id, staff.venueId));
  const [s] = await withTenant(v.tenantId, (tx) => tx.select().from(t.songRequest).where(and(eq(t.songRequest.id, id), eq(t.songRequest.venueId, v.id))));
  if (!s) throw new NotFound("Not found");
  return { v, s };
}

/** Accept & queue: the song goes to the end of tonight's queue. */
export async function queueSong(staff: Staff, id: string) {
  const { v } = await songForStaff(staff, id);
  await withTenant(v.tenantId, async (tx) => {
    const r = await tx.update(t.songRequest).set({ status: "queued", queuedAt: new Date() }).where(and(eq(t.songRequest.id, id), eq(t.songRequest.status, "requested"))).returning();
    if (!r.length) throw new Forbidden("Already handled");
    await publish(tx, topics.venue(v.id), { kind: "songs" });
  });
}

export async function playedSong(staff: Staff, id: string) {
  const { v } = await songForStaff(staff, id);
  await withTenant(v.tenantId, async (tx) => {
    await tx.update(t.songRequest).set({ status: "played" }).where(and(eq(t.songRequest.id, id), inArray(t.songRequest.status, ["requested", "queued"])));
    await publish(tx, topics.venue(v.id), { kind: "songs" });
  });
}

/**
 * Not tonight. A paid request is refunded at the provider first (so a failed refund leaves it
 * untouched for a retry), then the order is marked refunded.
 */
export async function declineSong(staff: Staff, id: string, provider: PaymentProvider) {
  const { v, s } = await songForStaff(staff, id);
  if (!["requested", "queued"].includes(s.status)) throw new Forbidden("Already handled");
  if (s.orderId) {
    const [o] = await withTenant(v.tenantId, (tx) => tx.select().from(t.orders).where(eq(t.orders.id, s.orderId!)));
    if (o?.status === "paid" && o.providerOrderId && o.amountPaidCents > 0) {
      await provider.refund({ providerOrderId: o.providerOrderId, txnRef: o.providerTxnRef, amountCents: o.amountPaidCents }, "Song request declined");
    }
    await withTenant(v.tenantId, async (tx) => {
      await tx.update(t.orders).set({ status: "refunded", refundedCents: sql`${t.orders.amountPaidCents}`, refundedAt: new Date() }).where(and(eq(t.orders.id, s.orderId!), eq(t.orders.status, "paid")));
      await tx.update(t.songRequest).set({ status: "refunded" }).where(eq(t.songRequest.id, id));
      await reverseWalletTx(tx, s.orderId!);
      await tx.insert(t.auditLog).values({ tenantId: v.tenantId, actor: `staff:${staff.id}`, action: "song_refunded", entity: `order:${s.orderId}`, detail: { songId: id } });
      await publish(tx, topics.venue(v.id), { kind: "songs" });
      await publish(tx, topics.order(s.orderId!), { kind: "order" });
    });
    return "refunded" as const;
  }
  await withTenant(v.tenantId, async (tx) => {
    await tx.update(t.songRequest).set({ status: "declined" }).where(eq(t.songRequest.id, id));
    await publish(tx, topics.venue(v.id), { kind: "songs" });
  });
  return "declined" as const;
}

/** A guest's own requests at a venue tonight, with where each is in the queue. */
export async function mySongs(venue: Venue, customerId: string) {
  return withTenant(venue.tenantId, async (tx) => {
    const rows = await tx.select().from(t.songRequest).where(and(eq(t.songRequest.venueId, venue.id), gte(t.songRequest.createdAt, new Date(Date.now() - 12 * 3_600_000)))).orderBy(asc(t.songRequest.queuedAt));
    const queue = rows.filter((r) => r.status === "queued");
    return rows.filter((r) => r.customerId === customerId && r.status !== "pending_payment").map((r) => ({ id: r.id, title: r.title, status: r.status, position: r.status === "queued" ? queue.findIndex((q) => q.id === r.id) + 1 : null }));
  });
}
