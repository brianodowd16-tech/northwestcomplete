import type { Metadata } from "next";
import { EnquiryForm } from "@/components/EnquiryForm";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { services } from "@/data/services";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact & Quotes",
  description: "Contact Northwest Boat Maintenance for a quote on marine servicing, restoration, electrical, solar, welding, cleaning or boat sales.",
};

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type } = await searchParams;
  const isQuote = type === "quote";

  return (
    <>
      <PageHeader
        eyebrow="Contact"
        title={isQuote ? "Request a quote" : "Get in touch"}
        intro="Tell us about your boat and what you need. We reply to every enquiry within one working day."
      />
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_1.6fr]">
        <aside className="space-y-5">
          {[
            ["phone", "Call", site.phone, `tel:${site.phone.replace(/[^+\d]/g, "")}`],
            ["mail", "Email", site.email, `mailto:${site.email}`],
            ["pin", "Area covered", site.region, undefined],
          ].map(([icon, label, value, href]) => (
            <div key={label} className="flex gap-4 rounded-xl border border-slate-200 bg-white p-5">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-navy-50 text-navy-700">
                <Icon name={icon!} />
              </span>
              <div>
                <p className="text-sm text-slate-500">{label}</p>
                {href ? (
                  <a href={href} className="font-semibold text-navy-900 hover:text-sea-700">{value}</a>
                ) : (
                  <p className="font-semibold text-navy-900">{value}</p>
                )}
              </div>
            </div>
          ))}
          <div className="rounded-xl bg-navy-50 p-5 text-sm text-navy-900">
            <p className="font-semibold">Opening hours</p>
            <p className="mt-1">Mon–Fri 8:00–18:00 · Sat 9:00–13:00</p>
            <p className="mt-1 text-navy-700">Emergency call-outs by arrangement.</p>
          </div>
        </aside>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <EnquiryForm
            type={isQuote ? "quote" : "general"}
            submitLabel={isQuote ? "Request quote" : "Send message"}
            fields={[
              { name: "service", label: "Service", type: "select", options: [...services.map((s) => s.name), "Shop order", "Other"] },
              { name: "boat", label: "Boat make, model & length" },
              { name: "location", label: "Where is the boat kept?", full: true },
            ]}
          />
        </section>
      </div>
    </>
  );
}
