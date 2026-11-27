import "server-only";
import { bankCredits, compareTakings, localDate, matchPayouts, mewsItems, MewsClient, myposDayTotals, MyposReportsClient, RevolutBusinessClient, TRYBE_BASE, TrybeClient, trybeBooking, WooClient, type MewsConfig, type PayoutMatch } from "@round/core";
import { connection, dayCardTakings, importWooOrder, orderWithLines, savePartnerBooking } from "@round/db/connect";
import { recordSync } from "@round/db/integrations";
import type { Venue } from "@round/db/services";
import { secretsKey } from "./server";

const dayBefore = (venue: Venue, n: number) => localDate(new Date(Date.now() - n * 86_400_000), venue.timezone);

/** Catches shop orders a webhook missed: paid orders from the last two days. */
export async function backfillWoo(venue: Venue) {
  const c = await connection<{ store: string }>(venue, "woocommerce", secretsKey());
  if (!c?.secrets.consumerKey || !c.secrets.consumerSecret) return { result: "not_set_up" as const };
  const today = localDate(new Date(), venue.timezone);
  try {
    const woo = new WooClient(c.config.store, c.secrets.consumerKey, c.secrets.consumerSecret);
    let imported = 0;
    for (let page = 1; page <= 10; page++) {
      const orders = await woo.paidOrders(new Date(Date.now() - 2 * 86_400_000).toISOString(), page);
      for (const o of orders) if ((await importWooOrder(venue, o)) === "imported") imported++;
      if (orders.length < 50) break;
    }
    await recordSync(venue, "woocommerce", today, imported ? "done" : "nothing", imported ? `${imported} orders` : null, null);
    return { result: "done" as const, imported };
  } catch (e) {
    await recordSync(venue, "woocommerce", today, "error", null, String(e instanceof Error ? e.message : e).slice(0, 500));
    return { result: "error" as const, error: String(e) };
  }
}

/** Pulls spa and activity bookings for the next two weeks (webhooks keep them current in between). */
export async function pullTrybe(venue: Venue) {
  const c = await connection<{ siteId: string; playground?: boolean }>(venue, "trybe", secretsKey());
  if (!c?.secrets.token || !c.config.siteId) return { result: "not_set_up" as const };
  const today = localDate(new Date(), venue.timezone);
  try {
    const api = new TrybeClient(c.secrets.token, c.config.playground ? TRYBE_BASE.playground : TRYBE_BASE.production);
    const from = new Date(Date.now() - 86_400_000), to = new Date(Date.now() + 14 * 86_400_000);
    let n = 0;
    for (let page = 1; page <= 20; page++) {
      const r = await api.orders(c.config.siteId, from, to, page);
      for (const o of r.data ?? []) {
        await savePartnerBooking(venue, trybeBooking(o));
        n++;
      }
      if (!r.meta?.last_page || page >= r.meta.last_page) break;
    }
    await recordSync(venue, "trybe", today, n ? "done" : "nothing", n ? `${n} bookings` : null, null);
    return { result: "done" as const, bookings: n };
  } catch (e) {
    await recordSync(venue, "trybe", today, "error", null, String(e instanceof Error ? e.message : e).slice(0, 500));
    return { result: "error" as const, error: String(e) };
  }
}

/**
 * Posts a room charge to Mews: finds the guest checked in to that room and adds the order to their bill,
 * one item per line with the right VAT code. False if Mews isn't set up (the generic PMS address is used).
 */
export async function chargeRoomInMews(venue: Venue, orderId: string, roomNumber: string): Promise<boolean> {
  const c = await connection<MewsConfig>(venue, "mews", secretsKey());
  if (!c?.secrets.clientToken || !c.secrets.accessToken) return false;
  const day = localDate(new Date(), venue.timezone);
  try {
    const r = await orderWithLines(venue, orderId);
    if (!r) throw new Error("Order not found");
    const api = new MewsClient({ platform: c.config.platform, clientToken: c.secrets.clientToken, accessToken: c.secrets.accessToken });
    const stay = await api.inHouse(roomNumber);
    if (!stay) throw new Error(`No guest checked in to room ${roomNumber} in Mews: post order #${r.order.number} by hand`);
    const items = mewsItems(r.lines.map((l) => ({ name: l.name, qty: l.qty, grossCents: l.grossCents, vatRate: l.vatRate as 9 | 23 })), c.config);
    const id = await api.addOrder({ serviceId: c.config.serviceId, accountId: stay.accountId, reservationId: stay.reservationId, items, notes: `${venue.name} order #${r.order.number}` });
    await recordSync(venue, "mews", day, "done", id, null);
    return true;
  } catch (e) {
    await recordSync(venue, "mews", day, "error", null, String(e instanceof Error ? e.message : e).slice(0, 500));
    return true; // handled: the failure raises a manager alert rather than falling back
  }
}

/**
 * Checks the last 10 trading days' card money landed in the venue's Revolut Business account.
 * A day whose payout hasn't arrived within 4 days is recorded as an error (which alerts managers).
 */
export async function reconcileRevolutBusiness(venue: Venue): Promise<PayoutMatch[] | { error: string }> {
  const c = await connection<{ env: "production" | "sandbox"; clientId: string; issuer: string; maxFeePct?: number }>(venue, "revolut_business", secretsKey());
  if (!c?.secrets.privateKey || !c.secrets.refreshToken) return { error: "Not set up" };
  try {
    const api = new RevolutBusinessClient({ env: c.config.env, clientId: c.config.clientId, issuer: c.config.issuer, privateKey: c.secrets.privateKey, refreshToken: c.secrets.refreshToken });
    const credits = bankCredits(await api.transactions(new Date(Date.now() - 16 * 86_400_000), new Date()), venue.timezone);
    const days = [];
    for (let n = 10; n >= 1; n--) {
      const date = dayBefore(venue, n);
      days.push({ date, expectedCents: (await dayCardTakings(venue, date)).totalCents });
    }
    const matches = matchPayouts(days, credits, localDate(new Date(), venue.timezone), { maxFee: (c.config.maxFeePct ?? 3) / 100 });
    for (const m of matches) {
      if (m.status === "matched") await recordSync(venue, "revolut_business", m.date, "done", m.credit!.id, null);
      if (m.status === "missing") await recordSync(venue, "revolut_business", m.date, "error", null, `No payout found for €${(m.expectedCents / 100).toFixed(2)} of card takings`);
    }
    return matches;
  } catch (e) {
    await recordSync(venue, "revolut_business", dayBefore(venue, 1), "error", null, String(e instanceof Error ? e.message : e).slice(0, 500));
    return { error: String(e instanceof Error ? e.message : e) };
  }
}

/** Compares yesterday's myPOS card takings in Complete with myPOS's own transaction report. */
export async function reconcileMypos(venue: Venue, date = dayBefore(venue, 1)) {
  const c = await connection<{ env: "production" | "sandbox" }>(venue, "mypos_reports", secretsKey());
  if (!c?.secrets.clientId || !c.secrets.clientSecret || !c.secrets.apiKey) return { result: "not_set_up" as const };
  try {
    const api = new MyposReportsClient({ env: c.config.env, clientId: c.secrets.clientId, clientSecret: c.secrets.clientSecret, apiKey: c.secrets.apiKey });
    const rows = await api.transactions(date, date);
    const theirs = myposDayTotals(rows, venue.timezone).get(date) ?? 0;
    const ours = (await dayCardTakings(venue, date)).myposCents;
    const cmp = compareTakings(ours, theirs);
    const eur = (x: number) => `€${(x / 100).toFixed(2)}`;
    await recordSync(venue, "mypos", date, cmp.ok ? (ours || theirs ? "done" : "nothing") : "error", cmp.ok ? `${eur(theirs)} matches` : null, cmp.ok ? null : `myPOS shows ${eur(theirs)}, Complete ${eur(ours)} (difference ${eur(cmp.diffCents)})`);
    return { result: cmp.ok ? ("match" as const) : ("mismatch" as const), oursCents: ours, theirsCents: theirs };
  } catch (e) {
    await recordSync(venue, "mypos", date, "error", null, String(e instanceof Error ? e.message : e).slice(0, 500));
    return { result: "error" as const, error: String(e instanceof Error ? e.message : e) };
  }
}
