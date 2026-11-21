import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { site, getMarket } from "@/lib/site";

export const metadata: Metadata = {
  title: "About Us",
  description: "The team behind Northwest Yachting in Malta and Northwest Boat Maintenance in Ireland.",
};

const COPY = {
  mt: {
    title: "A personal service for yacht owners in Malta",
    intro: `Northwest Yachting is a small, senior team led by ${site.contactName}, caring for motor yachts in Malta and Gozo.`,
    body: [
      "Owners come to us because they want one trusted team rather than a list of contractors. Engineering, paint and gelcoat, fabrication, energy systems and detailing are planned together and delivered to a single standard: ours.",
      "We work by appointment and with complete discretion, around your schedule, your crew and your guests. Your yacht's history, systems and preferences are recorded, so nothing is ever left to chance.",
      "We work alongside Mecca Marine and Granfort Yachts, and our engineering background is why buyers trust the yachts we present for sale.",
    ],
    cards: [
      ["shield", "Fully insured", "Comprehensive liability and professional cover on every project."],
      ["check", "Written proposals", "A clear, detailed proposal before any work begins."],
      ["pin", "Malta & Gozo", "Grand Harbour, Msida, Portomaso, Manoel Island and Mġarr."],
    ],
    cta: "Arrange a private consultation",
  },
  ie: {
    title: "Marine engineers for the North West",
    intro: "One trusted team for everything from an annual service to a full restoration, an off-grid power system or the sale of your boat.",
    body: [
      "Northwest Boat Maintenance looks after leisure and working boats across Donegal, Sligo, Leitrim and Mayo, on the coast, the loughs and the Shannon–Erne waterway. We bring the workshop to you wherever we can.",
      "Owners come to us because they're tired of chasing five different trades for one boat. Engine, gelcoat, welding, wiring, solar and cleaning are all under one roof, so jobs are planned together, done once and done right.",
      "Our engineering background is also why buyers trust the boats we sell and why we're confident sourcing engines: we know what good looks like.",
    ],
    cards: [
      ["shield", "Fully insured", "Public liability and professional cover on every job."],
      ["check", "Fixed quotes", "Clear written quotes before any major work."],
      ["pin", "Local & mobile", "Harbours, marinas and loughs across the North West."],
    ],
    cta: "Get a quote",
  },
};

export default async function AboutPage({ params }: { params: Promise<{ market: string }> }) {
  const m = getMarket((await params).market);
  const c = COPY[m.id];
  return (
    <>
      <PageHeader eyebrow="About" title={c.title} intro={c.intro} />
      <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
        <div className="space-y-5 text-lg leading-relaxed text-slate-700">
          {c.body.map((p) => (
            <p key={p.slice(0, 20)}>{p}</p>
          ))}
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-3">
          {c.cards.map(([icon, title, text]) => (
            <div key={title} className="rounded-xl border border-slate-200 bg-white p-5">
              <Icon name={icon} className="h-6 w-6 text-sea-600" />
              <p className="mt-3 font-semibold text-navy-900">{title}</p>
              <p className="mt-1 text-sm text-slate-600">{text}</p>
            </div>
          ))}
        </div>
        <div className="mt-12 text-center">
          <Link href="/contact?type=quote" className="rounded-md bg-sea-600 px-6 py-3 font-semibold text-white hover:bg-sea-700">
            {c.cta}
          </Link>
        </div>
      </div>
    </>
  );
}
