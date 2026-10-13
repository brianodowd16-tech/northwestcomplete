import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToCartButton } from "@/components/AddToCartButton";
import { EnquiryForm } from "@/components/EnquiryForm";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { getService, services } from "@/data/services";
import { getCatalogItem } from "@/lib/catalog";
import { formatPrice } from "@/lib/site";

type Params = Promise<{ slug: string }>;

export function generateStaticParams() {
  return services.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const service = getService((await params).slug);
  if (!service) return {};
  return { title: service.name, description: service.short };
}

const unitLabel = { fixed: "", "per-foot": " per ft", deposit: " deposit" } as const;

export default async function ServicePage({ params }: { params: Params }) {
  const service = getService((await params).slug);
  if (!service) notFound();

  return (
    <>
      <PageHeader eyebrow="Services" title={service.name} intro={service.intro} />
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_1.2fr]">
        <section>
          <h2 className="font-display text-2xl font-bold text-navy-900">What&apos;s included</h2>
          <ul className="mt-5 space-y-3">
            {service.includes.map((line) => (
              <li key={line} className="flex gap-3">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sea-100 text-sea-700">
                  <Icon name="check" className="h-4 w-4" />
                </span>
                <span className="text-slate-700">{line}</span>
              </li>
            ))}
          </ul>
          <div className="mt-8 rounded-xl bg-navy-50 p-5 text-sm text-navy-900">
            <p className="font-semibold">How booking works</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Choose a package below and pay securely online.</li>
              <li>We contact you within one working day to arrange a date.</li>
              <li>Any parts or extra work are agreed with you before we start.</li>
            </ol>
          </div>
        </section>

        <section>
          <h2 className="font-display text-2xl font-bold text-navy-900">Book & pay online</h2>
          <div className="mt-5 space-y-4">
            {service.options.map((o) => {
              const item = getCatalogItem(o.id)!;
              return (
                <div key={o.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="font-semibold text-navy-900">{o.name}</h3>
                    <p className="font-bold text-navy-900">
                      {formatPrice(o.price)}
                      <span className="text-sm font-medium text-slate-500">{unitLabel[o.unit]}</span>
                    </p>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{o.description}</p>
                  <AddToCartButton item={item} className="mt-4" />
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-sm text-slate-500">
            Prices include VAT. Mobile call-outs outside our core area (Donegal, Sligo, Leitrim, Mayo) may carry a travel charge —
            we&apos;ll always confirm before work begins.
          </p>
        </section>
      </div>

      <section className="bg-white py-14">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h2 className="font-display text-2xl font-bold text-navy-900">Need something bespoke?</h2>
          <p className="mt-2 text-slate-600">
            Tell us about your boat and the job and we&apos;ll send a fixed written quote. Or{" "}
            <Link href="/contact" className="font-semibold text-sea-700 underline">contact us</Link> directly.
          </p>
          <div className="mt-6">
            <EnquiryForm
              type="quote"
              submitLabel="Request a quote"
              defaults={{ service: service.name }}
              fields={[
                { name: "service", label: "Service", full: true },
                { name: "boat", label: "Boat make, model & length", required: true },
                { name: "location", label: "Where is the boat kept?", required: true },
              ]}
              messageLabel="Describe the job"
            />
          </div>
        </div>
      </section>
    </>
  );
}
