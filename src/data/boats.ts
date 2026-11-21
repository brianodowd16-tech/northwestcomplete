import type { MarketId } from "@/lib/site";

export type BoatListing = {
  /** Which site lists this boat. */
  market: MarketId;
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
 * Sample listings — replace with real boats. `market` decides which site shows each one. Each listing can take a refundable
 * reservation deposit through myPOS checkout.
 */
export const boats: BoatListing[] = [
  {
    market: "mt",
    slug: "example-flybridge-24m",
    title: "24m Flybridge Motor Yacht",
    type: "Motor",
    year: 2019,
    lengthFt: 79,
    engine: "Twin MTU 12V 2000 M96L",
    location: "Grand Harbour Marina, Birgu",
    price: 245000000,
    status: "For Sale",
    summary: "Sample listing. Four-cabin flybridge yacht, Malta-flagged, maintained by our engineers since delivery, with a full service history and fresh paint correction.",
    features: ["Four guest cabins", "Zero-speed stabilisers", "Tender garage & jet ski", "Lithium hotel bank with silent-anchor mode", "Crew quarters for three"],
    reservationDeposit: 500000,
  },
  {
    market: "mt",
    slug: "example-sports-yacht-18m",
    title: "18m Sports Yacht",
    type: "Motor",
    year: 2021,
    lengthFt: 59,
    engine: "Twin Volvo Penta IPS 950",
    location: "Portomaso Marina, St Julian's",
    price: 115000000,
    status: "For Sale",
    summary: "Sample listing. Sleek sports yacht with hardtop, joystick docking and a low-hours engine pair, ready for the Mediterranean season.",
    features: ["Joystick docking", "Hydraulic swim platform", "Three cabins", "Seakeeper gyro", "Teak decks"],
    reservationDeposit: 250000,
  },
  {
    market: "mt",
    slug: "example-coupe-12m",
    title: "12m Luxury Coupé",
    type: "Motor",
    year: 2024,
    lengthFt: 39,
    engine: "Twin Mercury Verado V12 600",
    location: "Msida Marina",
    price: 64000000,
    status: "Under Offer",
    summary: "Sample listing. Nearly new day cruiser with an overnight cabin, ideal for Comino and Gozo runs.",
    features: ["Electric sunroof", "Overnight cabin", "Bow and stern thrusters", "Premium audio", "Cockpit galley"],
    reservationDeposit: 100000,
  },
  {
    market: "ie",
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
    market: "ie",
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
    market: "ie",
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

export function getBoat(slug: string, market?: MarketId) {
  return boats.find((b) => b.slug === slug && (!market || b.market === market));
}
