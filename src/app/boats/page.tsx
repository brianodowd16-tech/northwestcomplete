import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { boats } from "@/data/boats";
import { formatPrice } from "@/lib/site";

export const metadata: Metadata = {
  title: "Boats for Sale",
  description: "Used boats for sale in the North West of Ireland — every listing inspected by our marine engineers.",
};

export default function BoatsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Brokerage"
        title="Boats for sale"
        intro="Every boat we list is inspected by our engineers, so you know what you're buying. Reserve online with a refundable deposit."
      />
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-xl bg-navy-50 p-5">
          <p className="text-navy-900">
            <span className="font-semibold">Selling a boat?</span> We prepare, photograph, list and sell it for you.
          </p>
          <Link href="/boats/sell" className="rounded-md bg-navy-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-700">
            Sell your boat
          </Link>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {boats.map((b) => (
            <Link key={b.slug} href={`/boats/${b.slug}`} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
              <div className="product-tile relative grid aspect-[16/10] place-items-center text-white">
                <Icon name="boat" className="h-16 w-16 opacity-80" />
                <span className={`absolute left-3 top-3 rounded-full px-2.5 py-0.5 text-xs font-semibold ${b.status === "For Sale" ? "bg-sea-300 text-navy-950" : "bg-brass-400 text-navy-950"}`}>
                  {b.status}
                </span>
              </div>
              <div className="p-5">
                <h2 className="font-display text-lg font-semibold text-navy-900">{b.year} {b.title}</h2>
                <dl className="mt-3 grid grid-cols-2 gap-y-1 text-sm text-slate-600">
                  <dt>Type</dt><dd className="text-right text-slate-900">{b.type}</dd>
                  <dt>Length</dt><dd className="text-right text-slate-900">{b.lengthFt} ft</dd>
                  <dt>Location</dt><dd className="text-right text-slate-900">{b.location}</dd>
                </dl>
                <p className="mt-4 text-xl font-bold text-navy-900">{formatPrice(b.price)}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
