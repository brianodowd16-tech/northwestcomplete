export type ServiceOption = {
  /** Stable id used in the cart and validated server-side at checkout. */
  id: string;
  name: string;
  description: string;
  /** Price in euro cents, VAT inclusive. */
  price: number;
  /** "fixed" = one-off price, "per-foot" = quantity is boat length in feet, "deposit" = booking deposit. */
  unit: "fixed" | "per-foot" | "deposit";
};

export type Service = {
  slug: string;
  name: string;
  short: string;
  icon: string;
  intro: string;
  includes: string[];
  options: ServiceOption[];
};

export const services: Service[] = [
  {
    slug: "mechanical-services",
    name: "Mechanical Services",
    short: "Inboard & outboard servicing, diagnostics, repowers and winterisation.",
    icon: "wrench",
    intro:
      "From annual servicing to full engine rebuilds, we look after petrol and diesel, inboard, outboard and sterndrive engines. We come to your marina, mooring or yard across the North West, or you can bring the boat to us.",
    includes: [
      "Annual engine service — oils, filters, impellers, belts, anodes",
      "Fault finding & diagnostics (Volvo Penta, Yanmar, Mercury, Yamaha, Suzuki, Honda, Beta & more)",
      "Sterndrive & saildrive servicing, bellows and seals",
      "Cooling, fuel and exhaust system repairs",
      "Winterisation & spring recommissioning",
      "Shaft, propeller, cutless bearing and steering work",
    ],
    options: [
      { id: "mech-outboard-service", name: "Outboard annual service (up to 60hp)", description: "Oil, filters, impeller, gear oil, plugs, anodes check. Parts extra.", price: 22500, unit: "fixed" },
      { id: "mech-inboard-service", name: "Inboard diesel annual service", description: "Single engine. Oil & filters, fuel filters, impeller, belts, coolant check. Parts extra.", price: 32500, unit: "fixed" },
      { id: "mech-diagnostic", name: "Diagnostic call-out (first 2 hours)", description: "On-site fault finding and written report.", price: 18000, unit: "fixed" },
      { id: "mech-winterise", name: "Winterisation package", description: "Engine, fresh water and heads winterised, fogging and laying up.", price: 27500, unit: "fixed" },
    ],
  },
  {
    slug: "machine-polishing",
    name: "Machine Polishing",
    short: "Multi-stage cut, polish & protect to bring tired gelcoat back to a deep gloss.",
    icon: "sparkle",
    intro:
      "Oxidised, chalky gelcoat is restored with a multi-stage machine compound and polish, finished with a marine wax or ceramic coating for long-lasting UV protection. Priced per foot of boat length.",
    includes: [
      "Wash, decontamination and oxidation assessment",
      "Single or multi-stage compound and polish",
      "Marine wax or ceramic coating protection",
      "Topsides, superstructure and decks",
      "Stainless and brightwork polishing",
    ],
    options: [
      { id: "polish-wax", name: "Machine polish & wax (topsides)", description: "Single-stage polish and premium marine wax. Price per foot.", price: 2800, unit: "per-foot" },
      { id: "polish-restore", name: "Oxidation restoration (multi-stage)", description: "Heavy cut, refine and wax for badly oxidised gelcoat. Price per foot.", price: 4500, unit: "per-foot" },
      { id: "polish-ceramic", name: "Ceramic coating upgrade", description: "Add a 2-year marine ceramic coating after polishing. Price per foot.", price: 3500, unit: "per-foot" },
    ],
  },
  {
    slug: "fiberglass-restoration",
    name: "Fiberglass Restoration",
    short: "Gelcoat & GRP repairs, osmosis treatment, keel and structural work.",
    icon: "layers",
    intro:
      "Chips, cracks, impact damage, osmosis and structural repairs carried out to a high cosmetic standard with colour-matched gelcoat. Every repair starts with an inspection and fixed written quote.",
    includes: [
      "Gelcoat chip, scratch and crack repairs with colour matching",
      "Impact and collision damage repair",
      "Osmosis treatment and epoxy barrier coats",
      "Stringer, transom and deck core repairs",
      "Antifouling and hull preparation",
      "Non-slip deck refurbishment",
    ],
    options: [
      { id: "grp-inspection", name: "GRP damage inspection & quote", description: "On-site inspection, moisture readings and fixed written quote. Deducted from the job if you go ahead.", price: 12000, unit: "fixed" },
      { id: "grp-antifoul", name: "Hull scrub & antifoul", description: "Pressure wash, prep and two coats of antifouling. Price per foot, paint included.", price: 3800, unit: "per-foot" },
      { id: "grp-deposit", name: "Restoration booking deposit", description: "Secures your slot in the workshop schedule.", price: 25000, unit: "deposit" },
    ],
  },
  {
    slug: "welding",
    name: "Welding & Fabrication",
    short: "Stainless & aluminium TIG/MIG welding, rails, arches, brackets and repairs.",
    icon: "flame",
    intro:
      "Marine-grade stainless steel and aluminium fabrication and repair — on-site or in the workshop. Bespoke pulpits, rails, radar arches, solar frames, davits and engine brackets made to measure.",
    includes: [
      "316 stainless steel TIG welding & polishing",
      "Aluminium hull and tank repairs",
      "Custom pulpits, pushpits, guard rails and stanchions",
      "Solar and radar arches, davits and bimini frames",
      "Outboard brackets, ladders and fittings",
    ],
    options: [
      { id: "weld-callout", name: "Mobile welding call-out (first hour)", description: "On-site repair. Further time billed at the hourly rate.", price: 15000, unit: "fixed" },
      { id: "weld-design", name: "Custom fabrication design & measure", description: "Site visit, measurements and drawings for a bespoke arch, rail or frame.", price: 17500, unit: "fixed" },
    ],
  },
  {
    slug: "electrical-fit-out",
    name: "Electrical Fit-Out",
    short: "DC & AC systems, rewires, navigation electronics and shore power.",
    icon: "bolt",
    intro:
      "Safe, tidy and properly documented marine electrical installations. We rewire older boats, install new electronics, and fault-find those intermittent problems that nobody else can track down.",
    includes: [
      "Full and partial 12V / 24V DC rewires to marine standards",
      "Shore power, inverters, chargers and galvanic isolators",
      "Chartplotters, radar, AIS, VHF and autopilot installation",
      "LED lighting upgrades, interior and navigation",
      "Electrical fault finding and safety surveys",
      "Wiring diagrams and documentation supplied",
    ],
    options: [
      { id: "elec-survey", name: "Electrical safety survey", description: "Full inspection of DC/AC systems with written report.", price: 19500, unit: "fixed" },
      { id: "elec-electronics", name: "Electronics install (per unit)", description: "Fit and commission a chartplotter, VHF, AIS or depth unit you supply.", price: 22000, unit: "fixed" },
      { id: "elec-deposit", name: "Rewire booking deposit", description: "Secures a workshop slot for a full or partial rewire.", price: 30000, unit: "deposit" },
    ],
  },
  {
    slug: "solar-battery-systems",
    name: "Solar & Battery Systems",
    short: "Off-grid power design and installation — solar, lithium, inverters, monitoring.",
    icon: "sun",
    intro:
      "Live aboard, cruise further or just stop running the engine to charge. We design and install complete solar and lithium battery systems sized to how you actually use your boat — from a single panel to a full off-grid setup.",
    includes: [
      "Energy audit and system design report",
      "Rigid and flexible solar panels, MPPT controllers",
      "LiFePO4 lithium battery banks with BMS",
      "DC-DC chargers, inverter/chargers and alternator protection",
      "Battery monitoring and Bluetooth/app integration",
      "Bespoke stainless/aluminium solar mounts (see Welding)",
    ],
    options: [
      { id: "solar-design", name: "Solar & battery system design", description: "Energy audit, component spec, wiring diagram and fixed install quote.", price: 15000, unit: "fixed" },
      { id: "solar-install-deposit", name: "System installation deposit", description: "Deposit to order components and book installation.", price: 50000, unit: "deposit" },
    ],
  },
  {
    slug: "deep-cleaning",
    name: "Deep Cleaning & Valeting",
    short: "Hull, deck and interior deep clean, mould treatment and upholstery.",
    icon: "droplet",
    intro:
      "A thorough top-to-bottom clean inside and out — ideal at launch, before a sale or after a long lay-up. Priced per foot of boat length.",
    includes: [
      "Hull, deck and superstructure wash and decontamination",
      "Teak cleaning and brightening",
      "Interior deep clean, bilges and lockers",
      "Mould and mildew treatment",
      "Upholstery, canvas and cockpit cushion cleaning",
      "Regular maintenance cleaning contracts available",
    ],
    options: [
      { id: "clean-exterior", name: "Exterior deep clean", description: "Hull, deck, superstructure, canvas and glass. Price per foot.", price: 1200, unit: "per-foot" },
      { id: "clean-full", name: "Full valet — inside & out", description: "Exterior plus interior, bilges, mould treatment and upholstery. Price per foot.", price: 2200, unit: "per-foot" },
    ],
  },
  {
    slug: "boat-brokerage",
    name: "Boat Brokerage & Sales",
    short: "Sell your boat with us or find your next one — prepared, presented and sold.",
    icon: "anchor",
    intro:
      "We list, prepare, photograph and sell boats on behalf of owners throughout the North West. Because we're engineers first, every boat we sell is inspected and buyers get an honest picture of what they're getting.",
    includes: [
      "Free valuation and listing advice",
      "Professional photography and listing on our site and major portals",
      "Pre-sale inspection, valet and polish packages",
      "Viewings, sea trials and negotiation handled for you",
      "Sale paperwork, deposits and handover",
      "Part-exchange and sourcing for buyers",
    ],
    options: [
      { id: "broker-listing", name: "Brokerage listing fee", description: "Photography, write-up and 6-month listing. Commission payable on sale.", price: 19500, unit: "fixed" },
    ],
  },
  {
    slug: "engine-sourcing",
    name: "Engine Sourcing",
    short: "New, reconditioned and used marine engines found, supplied and fitted.",
    icon: "cog",
    intro:
      "Need a replacement engine or a repower? Tell us what you have and what you need — we'll source new, reconditioned or quality used engines and gearboxes through our trade network, then supply and fit.",
    includes: [
      "Like-for-like replacements and repower recommendations",
      "New, reconditioned and inspected used engines",
      "Gearboxes, sterndrives and outboards",
      "Engine bed, coupling and alignment work",
      "Old engine removal and disposal",
    ],
    options: [
      { id: "engine-sourcing-fee", name: "Engine search deposit", description: "Refundable against purchase. Covers our search and sourcing report.", price: 10000, unit: "deposit" },
    ],
  },
];

export function getService(slug: string) {
  return services.find((s) => s.slug === slug);
}
