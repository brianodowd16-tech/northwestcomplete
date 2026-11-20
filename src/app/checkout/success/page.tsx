import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { site } from "@/lib/site";
import { ClearCart } from "./ClearCart";

export const metadata: Metadata = { title: "Thank you", robots: { index: false } };

export default async function SuccessPage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const order = (await searchParams).order?.replace(/[^A-Z0-9-]/gi, "").slice(0, 40);

  return (
    <div className="mx-auto max-w-2xl px-4 py-20 text-center sm:px-6">
      <ClearCart enabled />
      <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-sea-100 text-sea-700">
        <Icon name="check" className="h-8 w-8" />
      </span>
      <h1 className="mt-6 font-display text-3xl font-bold text-navy-900">Thank you for your order</h1>
      {order && (
        <p className="mt-3 text-slate-600">
          Your order reference is <strong className="tabular-nums">{order}</strong>.
        </p>
      )}
      <p className="mt-3 text-slate-600">
        A confirmation email is on its way. If you booked a service, {site.contactName} will be in touch within one working
        day to arrange a date. Shop orders are dispatched within 1–2 working days.
      </p>
      <p className="mt-3 text-slate-600">
        Questions? WhatsApp {site.contactName} on <a href={site.whatsapp} className="font-semibold text-sea-700 underline">{site.phone}</a>.
      </p>
      <div className="mt-8 flex justify-center gap-3">
        <Link href="/" className="rounded-md bg-navy-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-700">Back to home</Link>
        <Link href="/shop" className="rounded-md border border-slate-300 px-5 py-2.5 text-sm font-semibold text-navy-800 hover:bg-slate-100">Continue shopping</Link>
      </div>
    </div>
  );
}
