import type { Metadata } from "next";
import { EnquiryForm } from "@/components/EnquiryForm";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";

export const metadata: Metadata = {
  title: "Sell Your Boat",
  description: "Sell your boat through Northwest Boat Maintenance — valuation, preparation, photography, listing and sale handled for you.",
};

const steps = [
  ["Free valuation", "Tell us about your boat and we'll give you an honest market valuation."],
  ["Prepare & present", "Optional pre-sale service, polish and valet so your boat shows at its best."],
  ["List & market", "Professional photos and listing on our site and the major boat portals."],
  ["Viewings to handover", "We handle enquiries, viewings, sea trials, negotiation and paperwork."],
];

export default function SellPage() {
  return (
    <>
      <PageHeader
        eyebrow="Brokerage"
        title="Sell your boat with us"
        intro="As marine engineers, we can tell buyers exactly what they're getting — which means faster sales and fewer surprises."
      />
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_1.3fr]">
        <ol className="space-y-6">
          {steps.map(([title, text], i) => (
            <li key={title} className="flex gap-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sea-500 font-bold text-navy-950">{i + 1}</span>
              <div>
                <p className="font-semibold text-navy-900">{title}</p>
                <p className="text-slate-600">{text}</p>
              </div>
            </li>
          ))}
          <li className="flex gap-3 rounded-xl bg-navy-50 p-5 text-sm text-navy-900">
            <Icon name="shield" className="h-5 w-5 shrink-0" />
            Commission is only payable when your boat sells. A listing fee covers photography and marketing.
          </li>
        </ol>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-display text-xl font-semibold text-navy-900">Request a valuation</h2>
          <div className="mt-5">
            <EnquiryForm
              type="sell-boat"
              submitLabel="Request valuation"
              fields={[
                { name: "boat", label: "Make & model", required: true },
                { name: "year", label: "Year", type: "number" },
                { name: "length", label: "Length (ft)", type: "number" },
                { name: "engine", label: "Engine(s) & hours" },
                { name: "location", label: "Where is the boat kept?", required: true },
                { name: "asking", label: "Asking price in mind (optional)" },
              ]}
              messageLabel="Condition, equipment, recent work"
            />
          </div>
        </div>
      </div>
    </>
  );
}
