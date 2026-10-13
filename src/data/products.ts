export type Product = {
  id: string;
  slug: string;
  name: string;
  category: "Care & Polishing" | "Engine Parts" | "Electrical & Solar" | "Gift Vouchers";
  description: string;
  details: string[];
  /** Price in euro cents, VAT inclusive. */
  price: number;
  inStock: boolean;
  /** Physical goods need shipping; vouchers do not. */
  shippable: boolean;
};

export const products: Product[] = [
  {
    id: "prod-polish-kit",
    slug: "gelcoat-restoration-kit",
    name: "Gelcoat Restoration Kit",
    category: "Care & Polishing",
    description: "The compound, polish and wax we use in the workshop, packaged for DIY touch-ups between professional polishes.",
    details: ["500ml cutting compound", "500ml finishing polish", "500ml marine carnauba wax", "2 foam applicator pads & microfibre cloth"],
    price: 7495,
    inStock: true,
    shippable: true,
  },
  {
    id: "prod-ceramic-spray",
    slug: "ceramic-quick-detailer",
    name: "Ceramic Quick Detailer 1L",
    category: "Care & Polishing",
    description: "SiO2 spray sealant to top up ceramic coatings and add a slick, hydrophobic finish after every wash.",
    details: ["1 litre trigger bottle", "Safe on gelcoat, paint, glass and stainless", "UV protection"],
    price: 3295,
    inStock: true,
    shippable: true,
  },
  {
    id: "prod-mould-cleaner",
    slug: "mould-mildew-treatment",
    name: "Mould & Mildew Treatment 1L",
    category: "Care & Polishing",
    description: "Kills and prevents mould on interior surfaces, vinyl and canvas — ideal for laying up.",
    details: ["1 litre concentrate", "Chlorine-free formula", "Treats up to 40m²"],
    price: 2195,
    inStock: true,
    shippable: true,
  },
  {
    id: "prod-service-kit-outboard",
    slug: "outboard-service-kit",
    name: "Outboard Service Kit (specify model)",
    category: "Engine Parts",
    description: "Genuine or OEM-equivalent annual service kit for your outboard. Add your engine make, model and serial number at checkout notes or by email and we'll confirm fitment before dispatch.",
    details: ["Impeller & gasket", "Oil and fuel filters", "Spark plugs", "Gear oil & sump washers", "Anode set where applicable"],
    price: 8950,
    inStock: true,
    shippable: true,
  },
  {
    id: "prod-impeller",
    slug: "raw-water-impeller",
    name: "Raw Water Impeller (specify model)",
    category: "Engine Parts",
    description: "Replacement raw water pump impeller. Carry a spare — it's the most common cause of overheating. We'll confirm fitment before dispatch.",
    details: ["Neoprene impeller with gasket", "Fits most Volvo Penta, Yanmar and Beta pumps"],
    price: 3850,
    inStock: true,
    shippable: true,
  },
  {
    id: "prod-anode-kit",
    slug: "zinc-anode-kit",
    name: "Sacrificial Anode Kit",
    category: "Engine Parts",
    description: "Hull, shaft and engine anodes to protect against galvanic corrosion. Tell us your boat and we'll pack the right set.",
    details: ["Zinc or aluminium to suit your waters", "Stainless fixings included"],
    price: 5900,
    inStock: true,
    shippable: true,
  },
  {
    id: "prod-solar-100w",
    slug: "solar-panel-100w",
    name: "100W Marine Solar Panel",
    category: "Electrical & Solar",
    description: "High-efficiency monocrystalline panel with marine-grade junction box and cabling — the building block of most of our installs.",
    details: ["100W mono-crystalline", "Anodised aluminium frame", "MC4 connectors, 1m leads"],
    price: 14900,
    inStock: true,
    shippable: true,
  },
  {
    id: "prod-mppt",
    slug: "mppt-solar-controller",
    name: "MPPT Solar Charge Controller 20A",
    category: "Electrical & Solar",
    description: "Bluetooth-enabled MPPT controller, compatible with lead-acid, AGM and lithium (LiFePO4) batteries.",
    details: ["20A, 12/24V auto", "Bluetooth app monitoring", "Lithium profiles built in"],
    price: 13900,
    inStock: true,
    shippable: true,
  },
  {
    id: "prod-battery-monitor",
    slug: "battery-monitor",
    name: "Smart Battery Monitor",
    category: "Electrical & Solar",
    description: "Know exactly how much power you have left. Shunt-based monitor with Bluetooth app.",
    details: ["500A shunt", "State of charge, time remaining, history", "Bluetooth"],
    price: 17500,
    inStock: false,
    shippable: true,
  },
  {
    id: "prod-voucher-100",
    slug: "gift-voucher-100",
    name: "€100 Gift Voucher",
    category: "Gift Vouchers",
    description: "Redeemable against any service or shop purchase. Emailed to you after payment — the perfect present for the boat owner who has everything.",
    details: ["Valid for 2 years", "Emailed within 1 working day"],
    price: 10000,
    inStock: true,
    shippable: false,
  },
  {
    id: "prod-voucher-250",
    slug: "gift-voucher-250",
    name: "€250 Gift Voucher",
    category: "Gift Vouchers",
    description: "Redeemable against any service or shop purchase — covers a full machine polish on most small boats.",
    details: ["Valid for 2 years", "Emailed within 1 working day"],
    price: 25000,
    inStock: true,
    shippable: false,
  },
];

export const productCategories = Array.from(new Set(products.map((p) => p.category)));

export function getProduct(slug: string) {
  return products.find((p) => p.slug === slug);
}
