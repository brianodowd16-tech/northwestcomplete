import "server-only";
import { myposConfig } from "./config";
import { toCents } from "./money";
import { fromMyPosOrderId, verify, type Fields } from "./mypos";
import { PAID_STATUSES, addOrderNote, getOrder, updateOrder } from "./woo";

export type NotifyResult = { ok: boolean; status: number; body: string; log: string };

const field = (fields: Fields, name: string) => fields.find(([k]) => k === name)?.[1] ?? "";

const reply = (ok: boolean, log: string, status = ok ? 200 : 400): NotifyResult => ({
  ok,
  status,
  body: ok ? "OK" : "ERROR",
  log,
});

/**
 * Handles myPOS server-to-server callbacks. This is the only place an order
 * is marked paid: the browser return (URL_OK) is never trusted.
 *
 * myPOS expects HTTP 200 with body "OK". Anything else makes it treat the
 * callback as failed, which cancels the payment. So a bad signature, an
 * unknown order or a wrong amount deliberately get a non-OK reply.
 */
export async function handleNotify(fields: Fields): Promise<NotifyResult> {
  const cfg = myposConfig();
  if (!verify(fields, cfg.publicCert)) return reply(false, "invalid signature");

  const method = field(fields, "IPCmethod");
  const wooId = fromMyPosOrderId(field(fields, "OrderID"));
  if (!wooId) return reply(false, `unknown OrderID ${field(fields, "OrderID")}`);

  const trnref = field(fields, "IPC_Trnref");
  const order = await getOrder(wooId).catch(() => null);
  if (!order) return reply(false, `order ${wooId} not found`);

  if (method === "IPCPurchaseNotify") {
    if (PAID_STATUSES.has(order.status)) return reply(true, `order ${wooId} already paid`);
    if (order.status === "cancelled" || order.status === "refunded") {
      return reply(false, `order ${wooId} is ${order.status}`);
    }
    const amount = field(fields, "Amount");
    const currency = field(fields, "Currency");
    if (toCents(amount) !== toCents(order.total) || currency !== order.currency) {
      await addOrderNote(wooId, `myPOS payment REJECTED: paid ${amount} ${currency}, order total ${order.total} ${order.currency}. Ref ${trnref}`).catch(() => {});
      return reply(false, `amount mismatch on ${wooId}: ${amount} ${currency} vs ${order.total} ${order.currency}`);
    }
    await updateOrder(wooId, { set_paid: true, transaction_id: trnref });
    await addOrderNote(wooId, `Paid by card via myPOS${cfg.mode === "sandbox" ? " (SANDBOX – not a real payment)" : ""}. Transaction ref ${trnref}.`).catch(() => {});
    return reply(true, `order ${wooId} paid, ref ${trnref}`);
  }

  if (method === "IPCPurchaseRollback") {
    // myPOS reversed the payment because it didn't get our OK in time.
    if (PAID_STATUSES.has(order.status)) {
      await updateOrder(wooId, { status: "on-hold" });
    }
    await addOrderNote(wooId, `myPOS ROLLED BACK payment ${trnref}. Check the myPOS account before fulfilling.`).catch(() => {});
    return reply(true, `order ${wooId} rolled back`);
  }

  if (method === "IPCPurchaseCancel") {
    await addOrderNote(wooId, "Customer cancelled on the myPOS payment page.").catch(() => {});
    return reply(true, `order ${wooId} cancelled by customer`);
  }

  return reply(true, `ignored ${method} for ${wooId}`);
}
