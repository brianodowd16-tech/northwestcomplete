import "server-only";
import { z } from "zod";
import { SITE_URL, myposConfig } from "./config";
import { toCents } from "./money";
import { buildPurchase, toMyPosOrderId, type Fields } from "./mypos";
import { createOrder, getProductsLive, type WooOrder } from "./woo";

export const FULFILMENT = {
  collect: { method_id: "local_pickup", title: "Click & Collect – Carrick-on-Shannon showroom" },
  delivery: { method_id: "flat_rate", title: "Delivery – we'll call to arrange a date" },
} as const;

const text = (max: number) => z.string().trim().min(1).max(max);

export const CheckoutSchema = z.object({
  items: z
    .array(z.object({ id: z.number().int().positive(), qty: z.number().int().min(1).max(99) }))
    .min(1)
    .max(50),
  customer: z.object({
    firstName: text(60),
    lastName: text(60),
    email: z.string().trim().email().max(120),
    phone: z.string().trim().min(6).max(30),
    address1: text(120),
    city: text(60),
    county: z.string().trim().max(60).default(""),
    eircode: z.string().trim().max(10).default(""),
  }),
  fulfilment: z.enum(["collect", "delivery"]),
  notes: z.string().trim().max(500).default(""),
});

export type CheckoutRequest = z.infer<typeof CheckoutSchema>;

export class CheckoutError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

/** Order total in cents and the per-line amounts myPOS shows on its receipt. */
export function orderLines(order: WooOrder) {
  const items = order.line_items.map((li) => {
    const lineCents = toCents(li.total) + toCents(li.total_tax);
    return { name: li.name, quantity: li.quantity, unitCents: Math.round(lineCents / li.quantity) };
  });
  for (const s of order.shipping_lines) {
    const c = toCents(s.total) + toCents(s.total_tax);
    if (c) items.push({ name: s.method_title, quantity: 1, unitCents: c });
  }
  for (const f of order.fee_lines) {
    const c = toCents(f.total) + toCents(f.total_tax);
    if (c) items.push({ name: f.name, quantity: 1, unitCents: c });
  }
  return { totalCents: toCents(order.total), items };
}

export function returnUrls(order: Pick<WooOrder, "id" | "order_key">) {
  const q = `order=${order.id}&key=${encodeURIComponent(order.order_key)}`;
  return {
    ok: `${SITE_URL}/api/mypos/return?${q}`,
    cancel: `${SITE_URL}/api/mypos/cancel?${q}`,
    notify: `${SITE_URL}/api/mypos/notify`,
  };
}

/**
 * Creates the order in WooCommerce from live prices (the browser's cart is
 * only a list of ids and quantities) and returns the signed myPOS form.
 */
export async function startCheckout(req: CheckoutRequest): Promise<{ orderId: number; url: string; fields: Fields }> {
  const ids = [...new Set(req.items.map((i) => i.id))];
  const products = await getProductsLive(ids);

  for (const item of req.items) {
    const p = products.get(item.id);
    if (!p || !p.purchasable) throw new CheckoutError("An item in your basket is no longer available.", 409);
    if (!p.inStock) throw new CheckoutError(`${p.name} is out of stock.`, 409);
    if (item.qty > p.maxQty) throw new CheckoutError(`Only ${p.maxQty} × ${p.name} can be ordered.`, 409);
  }

  const c = req.customer;
  const address = {
    first_name: c.firstName,
    last_name: c.lastName,
    address_1: c.address1,
    city: c.city,
    state: c.county,
    postcode: c.eircode,
    country: "IE",
  };
  const method = FULFILMENT[req.fulfilment];

  const order = await createOrder({
    billing: { ...address, email: c.email, phone: c.phone },
    shipping: req.fulfilment === "delivery" ? address : undefined,
    line_items: req.items.map((i) => ({ product_id: i.id, quantity: i.qty })),
    shipping_lines: [{ method_id: method.method_id, method_title: method.title, total: "0" }],
    customer_note: req.notes || undefined,
  });

  const { totalCents, items } = orderLines(order);
  const { url, fields } = buildPurchase(myposConfig(), {
    orderId: toMyPosOrderId(order.id),
    currency: order.currency,
    totalCents,
    items,
    customer: {
      email: c.email,
      phone: c.phone,
      firstName: c.firstName,
      lastName: c.lastName,
      country: "IRL",
      city: c.city,
      zip: c.eircode,
      address: c.address1,
    },
    urls: returnUrls(order),
    note: `O'Dowds order #${order.number}`,
  });

  return { orderId: order.id, url, fields };
}
