import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToCartButton } from "@/components/AddToCartButton";
import { EnquiryForm } from "@/components/EnquiryForm";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { serviceCopy } from "@/data/content";
import { getService, services } from "@/data/services";
import { getCatalogItem } from "@/lib/catalog";
import { formatPrice, getMarket, site } from "@/lib/site";

type Params = Promise<{ market: string; slug: string }>;

export function generateStaticParams() {
  return services.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { market, slug } = await params;
  const service = getService(slug);
  if (!service) return {};
  const copy = serviceCopy(getMarket(market).id, service);
  return { title: copy.name, description: copy.short };
}

const unitLabel = { fixed: "", "per-foot": " per ft", deposit: " deposit" } as const;

export default async function ServicePage({ params }: { params: Params }) {
  const m = getMarket((await params).market);
  const service = getService((await params).slug);
  if (!service) notFound();
  const copy = serviceCopy(m.id, service);
  const lux = m.luxury;
  const thing = lux ? "yacht" : "boat";

  return (
    <>
      <PageHeader eyebrow="Services" title={copy.name} intro={copy.intro} />
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_1.2fr]">
        <section>
          {service.image && (
            <Image
              src={service.image.src}
              alt={service.image.alt}
              width={service.image.width}
              height={service.image.height}
              sizes="(min-width: 1024px) 45vw, 100vw"
              className="mb-8 aspect-[4/3] w-full rounded-2xl object-cover shadow-sm"
            />
          )}
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
            <p className="font-semibold">{lux ? "How we work" : "How booking works"}</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              {lux ? (
                <>
                  <li>Tell us about your yacht and what you have in mind.</li>
                  <li>{site.contactName} visits your berth and sends a detailed written proposal.</li>
                  <li>Work is scheduled around your plans and your guests.</li>
                </>
              ) : (
                <>
                  <li>Choose a package below and pay securely online.</li>
                  <li>We contact you within one working day to arrange a date.</li>
                  <li>Any parts or extra work are agreed with you before we start.</li>
                </>
              )}
            </ol>
          </div>
        </section>

        <section>
          <h2 className="font-display text-2xl font-bold text-navy-900">{lux ? "Indicative pricing" : "Book & pay online"}</h2>
          <div className="mt-5 space-y-4">
            {service.options.map((o) => {
              const item = getCatalogItem(o.id)!;
              return (
                <div key={o.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="font-semibold text-navy-900">{o.name}</h3>
                    <p className="font-bold text-navy-900">
                      {lux && o.unit !== "deposit" && <span className="text-sm font-medium text-slate-500">From </span>}
                      {formatPrice(o.price)}
                      <span className="text-sm font-medium text-slate-500">{unitLabel[o.unit]}</span>
                    </p>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{o.description}</p>
                  {lux && o.unit !== "deposit" ? (
                    <Link
                      href={`/contact?type=quote&service=${encodeURIComponent(copy.name)}`}
                      className="mt-4 inline-block rounded-full border border-navy-900 px-5 py-2 text-xs font-semibold uppercase tracking-widest text-navy-900 transition hover:bg-navy-900 hover:text-white"
                    >
                      Request a proposal
                    </Link>
                  ) : (
                    <AddToCartButton item={item} className="mt-4" label={lux ? "Secure your slot" : undefined} />
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-sm text-slate-500">
            {lux
              ? "Prices include VAT and are a starting point; every proposal is tailored to your yacht. We work across Malta and Gozo."
              : "Prices include VAT. Call-outs outside the North West may carry a travel charge — we'll always confirm before work begins."}
          </p>
        </section>
      </div>

      <section className="bg-white py-14">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h2 className="font-display text-2xl font-bold text-navy-900">{lux ? "Request a private proposal" : "Need something bespoke?"}</h2>
          <p className="mt-2 text-slate-600">
            Tell us about your {thing} and what you need and we&apos;ll send a detailed written proposal. Or{" "}
            <Link href="/contact" className="font-semibold text-sea-700 underline">contact us</Link> directly.
          </p>
          <div className="mt-6">
            <EnquiryForm
              type="quote"
              submitLabel={lux ? "Request proposal" : "Request a quote"}
              defaults={{ service: copy.name }}
              fields={[
                { name: "service", label: "Service", full: true },
                { name: "boat", label: lux ? "Yacht make, model & length" : "Boat make, model & length", required: true },
                { name: "location", label: lux ? "Marina or berth" : "Where is the boat kept?", required: true },
              ]}
              messageLabel="Describe the job"
            />
          </div>
        </div>
      </section>
    </>
  );
}
