export type BoatListing = {
  slug: string;
  title: string;
  type: "Motor" | "Sail" | "RIB" | "Fishing";
  year: number;
  lengthFt: number;
  engine: string;
  location: string;
  /** Asking price in euro cents. */
  price: number;
  status: "For Sale" | "Under Offer" | "Sold";
  summary: string;
  features: string[];
  /** Refundable viewing / reservation deposit in euro cents. */
  reservationDeposit: number;
};

/**
 * Sample listings — replace with real boats. Each listing can take a refundable
 * reservation deposit through Stripe checkout.
 */
export const boats: BoatListing[] = [
  {
    slug: "example-sea-angler-21",
    title: "21ft Sea Angler",
    type: "Fishing",
    year: 2016,
    lengthFt: 21,
    engine: "Honda BF115 outboard (approx. 600 hrs)",
    location: "Killybegs, Co. Donegal",
    price: 2950000,
    status: "For Sale",
    summary: "Sample listing. Well-kept fishing boat with forward cuddy, fish finder and road trailer. Serviced and polished by us before listing.",
    features: ["Garmin fishfinder/plotter", "VHF radio", "Road trailer", "Full service history", "Deck wash"],
    reservationDeposit: 50000,
  },
  {
    slug: "example-cruiser-27",
    title: "27ft Sports Cruiser",
    type: "Motor",
    year: 2008,
    lengthFt: 27,
    engine: "Volvo Penta D4 diesel, sterndrive",
    location: "Lough Erne",
    price: 4750000,
    status: "For Sale",
    summary: "Sample listing. Two-berth sports cruiser with new lithium battery bank and 200W solar installed by our team in 2025.",
    features: ["200W solar & lithium bank", "Bow thruster", "Hot water & shower", "Cockpit canopy", "Shore power"],
    reservationDeposit: 100000,
  },
  {
    slug: "example-yacht-32",
    title: "32ft Cruising Yacht",
    type: "Sail",
    year: 1998,
    lengthFt: 32,
    engine: "Yanmar 3GM30 diesel",
    location: "Sligo Harbour",
    price: 3900000,
    status: "Under Offer",
    summary: "Sample listing. Solid bluewater cruiser, osmosis-treated hull, rewired and new standing rigging.",
    features: ["Osmosis treated 2023", "Full rewire", "Autopilot", "Furling genoa", "Sprayhood & dodgers"],
    reservationDeposit: 100000,
  },
];

export function getBoat(slug: string) {
  return boats.find((b) => b.slug === slug);
}
