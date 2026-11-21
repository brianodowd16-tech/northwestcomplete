import { getMarket } from "@/lib/site";
import type { Metadata } from "next";
import { CheckoutForm } from "./CheckoutForm";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

export default async function CheckoutPage({ params, searchParams }: { params: Promise<{ market: string }>; searchParams: Promise<{ cancelled?: string }> }) {
  const m = getMarket((await params).market);
  const { cancelled } = await searchParams;
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <h1 className="font-display text-3xl font-bold text-navy-900">Checkout</h1>
      {cancelled && (
        <p className="mt-4 rounded-lg bg-brass-400/20 p-4 text-sm text-navy-900">
          Payment was cancelled and you haven&apos;t been charged. Your basket is still here when you&apos;re ready.
        </p>
      )}
      <CheckoutForm market={m.id} countries={m.checkoutCountries} />
    </div>
  );
}
