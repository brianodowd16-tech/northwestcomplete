import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { formatPrice } from "@/lib/site";
import { getStripe } from "@/lib/stripe";
import { ClearCart } from "./ClearCart";

export const metadata: Metadata = { title: "Order confirmed", robots: { index: false } };

async function getSession(id?: string) {
  const stripe = getStripe();
  if (!stripe || !id || !id.startsWith("cs_")) return null;
  try {
    return await stripe.checkout.sessions.retrieve(id);
  } catch {
    return null;
  }
}

export default async function SuccessPage({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const session = await getSession((await searchParams).session_id);
  const paid = session?.payment_status === "paid";

  return (
    <div className="mx-auto max-w-2xl px-4 py-20 text-center sm:px-6">
      <ClearCart enabled={paid} />
      <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-sea-100 text-sea-700">
        <Icon name="check" className="h-8 w-8" />
      </span>
      <h1 className="mt-6 font-display text-3xl font-bold text-navy-900">
        {paid ? "Thank you — payment received" : "Thanks for your order"}
      </h1>
      {session ? (
        <p className="mt-4 text-slate-600">
          {session.customer_details?.name ? `${session.customer_details.name}, we` : "We"}&apos;ve received your payment of{" "}
          <strong>{formatPrice(session.amount_total ?? 0)}</strong>. A receipt is on its way to{" "}
          <strong>{session.customer_details?.email}</strong>.
        </p>
      ) : (
        <p className="mt-4 text-slate-600">Your order is being processed. You&apos;ll receive a receipt by email shortly.</p>
      )}
      <p className="mt-3 text-slate-600">
        If you booked a service, we&apos;ll be in touch within one working day to arrange a date. Shop orders are dispatched within 1–2 working days.
      </p>
      <div className="mt-8 flex justify-center gap-3">
        <Link href="/" className="rounded-md bg-navy-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-700">Back to home</Link>
        <Link href="/shop" className="rounded-md border border-slate-300 px-5 py-2.5 text-sm font-semibold text-navy-800 hover:bg-slate-100">Continue shopping</Link>
      </div>
    </div>
  );
}
