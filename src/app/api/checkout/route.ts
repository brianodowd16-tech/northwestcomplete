import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getCatalogItem, SHIPPING } from "@/lib/catalog";
import { site } from "@/lib/site";
import { getStripe } from "@/lib/stripe";

type RequestLine = { id: unknown; quantity: unknown };

export async function POST(request: Request) {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      { error: "Online payments are not configured yet. Please contact us to complete your order." },
      { status: 503 },
    );
  }

  let body: { lines?: RequestLine[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const requested = Array.isArray(body.lines) ? body.lines.slice(0, 50) : [];
  if (requested.length === 0) {
    return NextResponse.json({ error: "Your basket is empty." }, { status: 400 });
  }

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
  const summary: string[] = [];
  let needsShipping = false;
  let hasService = false;
  let goodsTotal = 0;

  for (const line of requested) {
    const item = typeof line.id === "string" ? getCatalogItem(line.id) : undefined;
    const quantity = Number(line.quantity);
    if (!item) {
      return NextResponse.json({ error: "An item in your basket is no longer available." }, { status: 400 });
    }
    if (!item.available) {
      return NextResponse.json({ error: `${item.name} is currently unavailable.` }, { status: 400 });
    }
    if (!Number.isInteger(quantity) || quantity < item.minQty || quantity > item.maxQty) {
      return NextResponse.json({ error: `Invalid quantity for ${item.name}.` }, { status: 400 });
    }

    const perFoot = item.unit === "per-foot";
    lineItems.push({
      quantity,
      price_data: {
        currency: site.currency,
        unit_amount: item.price,
        tax_behavior: "inclusive",
        product_data: {
          name: perFoot ? `${item.name} (per ft)` : item.name,
          description: perFoot ? `${quantity} ft boat — ${item.description}` : item.description,
          metadata: { catalog_id: item.id, kind: item.kind },
        },
      },
    });
    summary.push(`${item.id}x${quantity}`);

    if (item.shippable) {
      needsShipping = true;
      goodsTotal += item.price * quantity;
    }
    if (item.kind === "service") hasService = true;
  }

  const origin = request.headers.get("origin") ?? site.url;

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "payment",
    line_items: lineItems,
    currency: site.currency,
    success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/cart`,
    phone_number_collection: { enabled: true },
    billing_address_collection: "required",
    allow_promotion_codes: true,
    customer_creation: "always",
    metadata: { items: summary.join(",").slice(0, 500) },
    custom_text: {
      submit: { message: "All prices include Irish VAT at the applicable rate. We'll be in touch within one working day to confirm any service booking." },
    },
  };

  if (hasService) {
    params.custom_fields = [
      {
        key: "boat",
        label: { type: "custom", custom: "Boat make, model & length" },
        type: "text",
        text: { maximum_length: 120 },
      },
      {
        key: "location",
        label: { type: "custom", custom: "Where is the boat kept?" },
        type: "text",
        text: { maximum_length: 120 },
      },
    ];
  }

  if (needsShipping) {
    const freeDelivery = goodsTotal >= SHIPPING.freeOver;
    params.shipping_address_collection = { allowed_countries: ["IE", "GB"] };
    params.shipping_options = [
      {
        shipping_rate_data: {
          display_name: freeDelivery ? "Free tracked delivery (Ireland & NI)" : "Tracked delivery (Ireland & NI)",
          type: "fixed_amount",
          fixed_amount: { amount: freeDelivery ? 0 : SHIPPING.standard, currency: site.currency },
          tax_behavior: "inclusive",
          delivery_estimate: { minimum: { unit: "business_day", value: 2 }, maximum: { unit: "business_day", value: 4 } },
        },
      },
      {
        shipping_rate_data: {
          display_name: "Collect from workshop / have it brought to your boat",
          type: "fixed_amount",
          fixed_amount: { amount: 0, currency: site.currency },
          tax_behavior: "inclusive",
        },
      },
    ];
  }

  try {
    const session = await stripe.checkout.sessions.create(params);
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[checkout] stripe error", err);
    return NextResponse.json({ error: "We couldn't start checkout. Please try again." }, { status: 502 });
  }
}
