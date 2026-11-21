import { NextResponse } from "next/server";
import { CheckoutError, CheckoutSchema, startCheckout } from "@/lib/checkout";
import { STORE } from "@/lib/config";
import { WooNotConfigured } from "@/lib/woo";

export async function POST(request: Request) {
  const parsed = CheckoutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Please check your details and try again." }, { status: 400 });
  }
  try {
    return NextResponse.json(await startCheckout(parsed.data));
  } catch (err) {
    if (err instanceof CheckoutError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[checkout]", err);
    const message =
      err instanceof WooNotConfigured
        ? `Online checkout isn't switched on yet. Please email ${STORE.email} to order.`
        : `We couldn't start your payment. Please try again, or email ${STORE.email}.`;
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
