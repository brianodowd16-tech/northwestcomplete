import "server-only";
import { receiptData } from "@round/db/services";
import { mailConfigured, sendEmail } from "./mail";

const eur = (c: number) => `€${(c / 100).toFixed(2)}`;

/** Emails the guest a VAT receipt once their payment is confirmed. Never blocks the payment flow. */
export async function sendReceipt(orderId: string) {
  if (!mailConfigured()) return;
  const r = await receiptData(orderId);
  if (!r || r.order.status !== "paid" || !r.customer?.email || r.customer.deletedAt) return;
  const { order: o, customer: c, venue: v, lines } = r;
  const when = (o.paidAt ?? new Date()).toLocaleString("en-IE", { timeZone: v.timezone, dateStyle: "medium", timeStyle: "short" });
  const text = [
    `${v.name}${v.town ? `, ${v.town}` : ""}`,
    v.vatNumber ? `VAT number: ${v.vatNumber}` : "",
    `Receipt for order #${o.number} · ${when}`,
    "",
    ...lines.map((l) => `${l.qty} × ${l.name}  ${eur(l.grossCents)}  (VAT ${l.vatRate}%)`),
    "",
    `Total incl. VAT  ${eur(o.grossCents)}`,
    `  VAT at 9%  ${eur(o.vat9Cents)}`,
    `  VAT at 23%  ${eur(o.vat23Cents)}`,
    o.creditUsedCents ? `Paid with credit  −${eur(o.creditUsedCents)}` : "",
    o.tipCents ? `Tip for the staff  ${eur(o.tipCents)}` : "",
    `Paid by card  ${eur(o.amountPaidCents)}`,
    "",
    `Thanks for coming in. Your order: ${process.env.APP_URL ?? ""}/v/${v.slug}/order/${o.id}`,
  ]
    .filter((x, i, a) => x !== "" || a[i - 1] !== "")
    .join("\n");
  await sendEmail(c.email, `Your receipt from ${v.name} (order #${o.number})`, text);
}
