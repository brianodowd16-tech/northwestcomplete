import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToCartButton } from "@/components/AddToCartButton";
import { EnquiryForm } from "@/components/EnquiryForm";
import { Icon } from "@/components/Icon";
import { boats, getBoat } from "@/data/boats";
import { boatDepositId, getCatalogItem } from "@/lib/catalog";
import { formatPrice } from "@/lib/site";

type Params = Promise<{ slug: string }>;

export function generateStaticParams() {
  return boats.map((b) => ({ slug: b.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const boat = getBoat((await params).slug);
  if (!boat) return {};
  return { title: `${boat.year} ${boat.title} for sale`, description: boat.summary };
}

export default async function BoatPage({ params }: { params: Params }) {
  const boat = getBoat((await params).slug);
  if (!boat) notFound();
  const deposit = getCatalogItem(boatDepositId(boat.slug))!;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <nav className="text-sm text-slate-500">
        <Link href="/boats" className="hover:text-sea-700">Boats for sale</Link> / {boat.title}
      </nav>
      <div className="mt-6 grid gap-10 lg:grid-cols-[1.3fr_1fr]">
        <div>
          <div className="product-tile relative grid aspect-[16/10] place-items-center rounded-2xl text-white">
            <Icon name="boat" className="h-24 w-24 opacity-80" />
            <span className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-sm font-semibold text-navy-900">{boat.status}</span>
          </div>
          <h2 className="mt-8 font-display text-2xl font-bold text-navy-900">About this boat</h2>
          <p className="mt-3 text-slate-700">{boat.summary}</p>
          <h3 className="mt-6 font-semibold text-navy-900">Features</h3>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {boat.features.map((f) => (
              <li key={f} className="flex gap-2 text-slate-700">
                <Icon name="check" className="h-5 w-5 shrink-0 text-sea-600" /> {f}
              </li>
            ))}
          </ul>
        </div>

        <aside className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h1 className="font-display text-2xl font-bold text-navy-900">{boat.year} {boat.title}</h1>
            <p className="mt-2 text-3xl font-bold text-navy-900">{formatPrice(boat.price)}</p>
            <dl className="mt-5 grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-slate-500">Type</dt><dd className="text-right">{boat.type}</dd>
              <dt className="text-slate-500">Year</dt><dd className="text-right">{boat.year}</dd>
              <dt className="text-slate-500">Length</dt><dd className="text-right">{boat.lengthFt} ft</dd>
              <dt className="text-slate-500">Engine</dt><dd className="text-right">{boat.engine}</dd>
              <dt className="text-slate-500">Location</dt><dd className="text-right">{boat.location}</dd>
            </dl>
            <div className="mt-6 border-t border-slate-200 pt-5">
              <p className="text-sm text-slate-600">
                Reserve this boat with a <strong>{formatPrice(boat.reservationDeposit)}</strong> refundable deposit while you arrange a
                viewing, sea trial or survey.
              </p>
              <AddToCartButton item={deposit} label="Reserve with deposit" className="mt-4" />
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="font-display text-lg font-semibold text-navy-900">Arrange a viewing</h2>
            <div className="mt-4">
              <EnquiryForm
                type="boat-viewing"
                submitLabel="Send viewing request"
                defaults={{ boat: `${boat.year} ${boat.title} (${boat.slug})` }}
                fields={[{ name: "boat", label: "Boat", full: true }]}
                messageLabel="Questions or preferred viewing times"
              />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
