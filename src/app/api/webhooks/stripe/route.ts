import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { sendEmail } from "@/lib/email";
import { formatPrice } from "@/lib/site";
import { getStripe } from "@/lib/stripe";

export async function POST(request: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!stripe || !secret || !signature) {
    return NextResponse.json({ error: "Webhook not configured." }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await request.text(), signature, secret);
  } catch (err) {
    console.error("[webhook] signature verification failed", err);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const items = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 });
    const customer = session.customer_details;
    const shipping = session.collected_information?.shipping_details;
    const fields = (session.custom_fields ?? []).map(
      (f) => `${f.label.custom ?? f.key}: ${f.text?.value ?? "-"}`,
    );

    const lines = items.data.map(
      (li) => `- ${li.quantity} × ${li.description} — ${formatPrice(li.amount_total)}`,
    );

    await sendEmail({
      subject: `New order ${session.id.slice(-8).toUpperCase()} — ${formatPrice(session.amount_total ?? 0)}`,
      replyTo: customer?.email ?? undefined,
      text: [
        `Customer: ${customer?.name ?? "-"}`,
        `Email: ${customer?.email ?? "-"}`,
        `Phone: ${customer?.phone ?? "-"}`,
        ...fields,
        shipping?.address
          ? `Ship to: ${shipping.name}, ${addressLine(shipping.address)}`
          : "Shipping: n/a",
        "",
        ...lines,
        "",
        `Total paid: ${formatPrice(session.amount_total ?? 0)}`,
        `Stripe session: ${session.id}`,
      ].join("\n"),
    });
  }

  return NextResponse.json({ received: true });
}

function addressLine(a: Stripe.Address) {
  return [a.line1, a.line2, a.city, a.state, a.postal_code, a.country].filter(Boolean).join(", ");
}
