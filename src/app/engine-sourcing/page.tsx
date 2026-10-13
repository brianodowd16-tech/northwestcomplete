import type { Metadata } from "next";
import { AddToCartButton } from "@/components/AddToCartButton";
import { EnquiryForm } from "@/components/EnquiryForm";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { getService } from "@/data/services";
import { getCatalogItem } from "@/lib/catalog";
import { formatPrice } from "@/lib/site";

export const metadata: Metadata = {
  title: "Engine Sourcing",
  description: "New, reconditioned and used marine engines, gearboxes and outboards sourced, supplied and fitted in the North West of Ireland.",
};

export default function EngineSourcingPage() {
  const service = getService("engine-sourcing")!;
  const deposit = getCatalogItem("engine-sourcing-fee")!;

  return (
    <>
      <PageHeader eyebrow="Engine Sourcing" title="The right engine, found and fitted" intro={service.intro} />
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_1.3fr]">
        <section>
          <ul className="space-y-3">
            {service.includes.map((line) => (
              <li key={line} className="flex gap-3 text-slate-700">
                <Icon name="check" className="h-5 w-5 shrink-0 text-sea-600" /> {line}
              </li>
            ))}
          </ul>
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="font-display text-lg font-semibold text-navy-900">Priority search</h2>
            <p className="mt-2 text-sm text-slate-600">
              Pay a {formatPrice(deposit.price)} search deposit and we&apos;ll put your search at the top of the list. It&apos;s
              deducted in full from the price of the engine when you buy through us.
            </p>
            <AddToCartButton item={deposit} label="Pay search deposit" className="mt-4" />
          </div>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-display text-xl font-semibold text-navy-900">Tell us what you need</h2>
          <p className="mt-1 text-sm text-slate-600">Free, no-obligation. We&apos;ll come back with options and prices.</p>
          <div className="mt-5">
            <EnquiryForm
              type="engine-sourcing"
              submitLabel="Start my engine search"
              fields={[
                { name: "boat", label: "Boat make, model & length", required: true },
                { name: "current_engine", label: "Current engine (make, model, hp)" },
                { name: "engine_type", label: "Looking for", type: "select", options: ["Inboard diesel", "Inboard petrol", "Outboard", "Sterndrive", "Saildrive", "Gearbox only", "Not sure — advise me"], required: true },
                { name: "condition", label: "Condition", type: "select", options: ["New", "Reconditioned", "Used (inspected)", "Any — best value"] },
                { name: "budget", label: "Budget (approx.)" },
                { name: "fitting", label: "Fitting required?", type: "select", options: ["Supply & fit", "Supply only"] },
              ]}
              messageLabel="Anything else we should know?"
            />
          </div>
        </section>
      </div>
    </>
  );
}
