import type { MarketId } from "@/lib/site";
import type { Service } from "./services";

type Copy = { name: string; short: string; intro: string };

/** Malta (Northwest Yachting) wording for each service; Ireland uses the copy in services.ts. */
const malta: Record<string, Copy> = {
  "mechanical-services": {
    name: "Engineering & Maintenance",
    short: "Planned maintenance, diagnostics and engine care for motor yachts, by engineers who know your systems.",
    intro:
      "We take care of the engine room so you never have to think about it. Scheduled servicing, diagnostics and repairs for inboard diesels, sterndrives and outboards, carried out on your berth in Malta or Gozo, with a full service log for every visit.",
  },
  "machine-polishing": {
    name: "Paint & Gelcoat Correction",
    short: "Multi-stage machine correction that returns hulls and superstructures to a deep, mirror finish.",
    intro:
      "The Mediterranean sun is unforgiving on gelcoat and paint. Our multi-stage correction removes oxidation and swirl marks, then seals the finish against UV and salt, so your yacht looks as it did on launch day. Full hull, topsides or bottomsides, priced per foot.",
  },
  "fiberglass-restoration": {
    name: "Hull, Gelcoat & Antifouling",
    short: "Invisible gelcoat repairs, osmosis treatment and premium antifouling at haul-out.",
    intro:
      "From a chipped transom to a full underwater programme at haul-out, our repairs are colour-matched and finished to a standard you won't find the join in. Antifouling is applied with the right system for warm Maltese waters.",
  },
  "boat-brokerage": {
    name: "Brokerage & Acquisition",
    short: "Discreet sale and acquisition of motor yachts, with an engineer's inspection behind every listing.",
    intro:
      "Whether you're selling, buying or moving up, we handle it quietly and thoroughly. Every yacht we present has been inspected by our own engineers, and we manage viewings, sea trials, survey and handover on your behalf.",
  },
  "electrical-fit-out": {
    name: "Electrical & Navigation Systems",
    short: "Clean, documented electrical installations, navigation electronics and shore power.",
    intro:
      "Modern yachts live and die by their electrics. We design and install DC and AC systems, navigation and entertainment electronics and shore power to a standard that's documented, tidy and dependable.",
  },
  "solar-battery-systems": {
    name: "Energy & Lithium Systems",
    short: "Silent power at anchor: solar, lithium storage and inverter systems designed around how you cruise.",
    intro:
      "Spend the night at Comino or Blue Lagoon without running the generator. We design and integrate solar arrays, lithium battery banks and inverters sized to your yacht and your cruising, with discreet mounting and app monitoring.",
  },
  "deep-cleaning": {
    name: "Detailing & Interior Care",
    short: "Meticulous detailing inside and out, before guests arrive, after charters and through the season.",
    intro:
      "Teak, stainless, upholstery and glass, cared for to a five-star standard. Book a one-off detail before guests arrive or a weekly programme through the season, so your yacht is always ready when you are.",
  },
  welding: {
    name: "Bespoke Stainless Fabrication",
    short: "Made-to-measure stainless and aluminium: rails, arches, davits and fittings, polished to a mirror.",
    intro:
      "Custom 316 stainless and aluminium work, designed and fabricated to match your yacht: pulpits, radar and solar arches, davits, bimini frames and brackets, finished to mirror polish.",
  },
  "engine-sourcing": {
    name: "Repower & Engine Sourcing",
    short: "Repowers and replacement engines sourced, supplied and fitted through our trade network.",
    intro:
      "When it's time for new engines, we specify the right package, source it through our trade network and manage the whole repower: removal, installation, alignment and commissioning.",
  },
  "marina-design-consultancy": {
    name: "Marina Design Consultancy",
    short: "Expert advice for new and expanding marinas, pontoons and private berths in Malta.",
    intro:
      "Planning a marina, extending pontoons or designing a private berth? We bring hands-on experience of how yachts are berthed, serviced and powered to help you build facilities that discerning owners want to use.",
  },
};

export function serviceCopy(market: MarketId, s: Service): Copy {
  return (market === "mt" && malta[s.slug]) || { name: s.name, short: s.short, intro: s.intro };
}

export type Partner = { name: string; description: string; /** Official website; leave out until confirmed. */ url?: string };

/** Malta partners, shown on the Malta site only. Wording kept to publicly stated facts about each company. */
export const partners: Partner[] = [
  {
    name: "Mecca Marine",
    description:
      "The marine division of Mecca Enterprises in St Paul's Bay: boat sales, servicing for brands including MerCruiser and Simrad, yacht registration and charter.",
    url: "https://mecca-marine.com",
  },
  {
    name: "Granfort Yachts",
    description: "Brazilian-built luxury cruisers and coupés from Fibrafort, a yard building boats since 1990.",
  },
];
