import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "About Us",
  description: "Northwest Boat Maintenance — marine engineering, restoration and brokerage based in the North West of Ireland.",
};

export default function AboutPage() {
  return (
    <>
      <PageHeader
        eyebrow="About"
        title="Marine engineers for the North West"
        intro="One trusted team for everything from an annual service to a full restoration, an off-grid power system or the sale of your boat."
      />
      <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
        <div className="space-y-5 text-lg leading-relaxed text-slate-700">
          <p>
            {site.name} looks after leisure and working boats across Donegal, Sligo, Leitrim and Mayo — on the coast, the
            loughs and the Shannon–Erne waterway. We&apos;re a hands-on team of marine engineers, fabricators and finishers,
            and we bring the workshop to you wherever we can.
          </p>
          <p>
            Owners come to us because they&apos;re tired of chasing five different trades for one boat. Engine, gelcoat,
            welding, wiring, solar and cleaning are all under one roof — so jobs are planned together, done once and done right.
          </p>
          <p>
            Our engineering background is also why buyers trust the boats we sell and why we&apos;re confident sourcing
            engines: we know what good looks like, and we&apos;ll tell you honestly when something isn&apos;t.
          </p>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-3">
          {[
            ["shield", "Fully insured", "Public liability and professional cover on every job."],
            ["check", "Fixed quotes", "Clear written quotes before any major work."],
            ["pin", "Local & mobile", `Covering ${site.areas.length}+ harbours, marinas & loughs.`],
          ].map(([icon, title, text]) => (
            <div key={title} className="rounded-xl border border-slate-200 bg-white p-5">
              <Icon name={icon} className="h-6 w-6 text-sea-600" />
              <p className="mt-3 font-semibold text-navy-900">{title}</p>
              <p className="mt-1 text-sm text-slate-600">{text}</p>
            </div>
          ))}
        </div>
        <div className="mt-12 text-center">
          <Link href="/contact?type=quote" className="rounded-md bg-sea-600 px-6 py-3 font-semibold text-white hover:bg-sea-700">
            Get a quote
          </Link>
        </div>
      </div>
    </>
  );
}
