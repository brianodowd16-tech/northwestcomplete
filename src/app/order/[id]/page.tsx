import crypto from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OrderStatusWatcher } from "@/components/OrderStatusWatcher";
import { STORE } from "@/lib/config";
import { formatPrice, toCents } from "@/lib/money";
import { PAID_STATUSES, getOrder } from "@/lib/woo";

export const metadata: Metadata = { title: "Your order", robots: { index: false } };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ key?: string }> };

const sameKey = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

export default async function OrderPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { key = "" } = await searchParams;
  if (!/^\d+$/.test(id)) notFound();
  const order = await getOrder(Number(id)).catch(() => null);
  // The order key from the payment link is the shopper's proof this order is theirs.
  if (!order || !sameKey(order.order_key, key)) notFound();

  const paid = PAID_STATUSES.has(order.status);
  const failed = ["failed", "cancelled"].includes(order.status);
  const collect = order.shipping_lines.some((s) => /collect/i.test(s.method_title));

  return (
    <div className="wrap" style={{ maxWidth: 760, padding: "48px var(--gutter) 72px" }}>
      <OrderStatusWatcher paid={paid} />
      {paid ? (
        <>
          <p className="eyebrow">Order #{order.number} confirmed</p>
          <h1>Thank you, {order.billing.first_name}!</h1>
          <p className="lead">
            Your payment was successful and a confirmation has been sent to {order.billing.email}.{" "}
            {collect ? "We'll email you as soon as your order is ready to collect from the showroom." : "We'll be in touch shortly about your order."}
          </p>
        </>
      ) : failed ? (
        <>
          <p className="eyebrow">Order #{order.number}</p>
          <h1>Payment didn't go through</h1>
          <p className="lead">You haven't been charged. Your basket is saved, so you can <Link className="link" href="/checkout">try again</Link> or email us at {STORE.email}.</p>
        </>
      ) : (
        <>
          <p className="eyebrow">Order #{order.number}</p>
          <h1>Confirming your payment…</h1>
          <p className="lead" role="status">This usually takes a few seconds. The page updates by itself, so there's no need to pay again.</p>
        </>
      )}

      <div className="panel" style={{ marginTop: 32 }}>
        <h2>Order summary</h2>
        <div className="totals">
          {order.line_items.map((li) => (
            <div key={li.id}><span>{li.quantity} × {li.name}</span><span>{formatPrice(toCents(li.total) + toCents(li.total_tax), order.currency)}</span></div>
          ))}
          {order.shipping_lines.map((s, i) => (
            <div key={i} className="muted"><span>{s.method_title}</span><span>{toCents(s.total) ? formatPrice(toCents(s.total) + toCents(s.total_tax), order.currency) : "Free"}</span></div>
          ))}
          <div className="grand"><span>Total</span><span>{formatPrice(toCents(order.total), order.currency)}</span></div>
        </div>
        {order.transaction_id && <p className="muted" style={{ fontSize: ".85rem" }}>Payment reference: {order.transaction_id}</p>}
      </div>
      <p style={{ marginTop: 24 }}>
        Questions about your order? Email <a className="link" href={`mailto:${STORE.email}`}>{STORE.email}</a> and quote order #{order.number}.
      </p>
    </div>
  );
}
