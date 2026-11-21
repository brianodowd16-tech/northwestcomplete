/** Contact details shared by both sites. */
export const site = {
  email: "brian@northwestboatmaintenance.com",
  phone: "+353 86 452 3131",
  contactName: "Brían",
  /** WhatsApp click-to-chat link (number in international format, digits only). */
  whatsapp: "https://wa.me/353864523131",
  currency: "eur",
};

export type MarketId = "mt" | "ie";

export type Market = {
  id: MarketId;
  /** Brand shown on this site. */
  name: string;
  domain: string;
  url: string;
  tagline: string;
  region: string;
  areas: string[];
  /** Countries for structured data. */
  countries: string[];
  /** Delivery/checkout countries offered (codes from lib/catalog COUNTRIES). */
  checkoutCountries: ("IE" | "NI" | "MT")[];
  /** Logo image, or null to use the typographic wordmark. */
  logo: { src: string; width: number; height: number } | null;
  /** Online shop for parts and care products. */
  shop: boolean;
  /** Luxury presentation: "from" prices and proposals instead of add-to-basket for standard services. */
  luxury: boolean;
  /** The sister site, linked from the footer. */
  sister: { id: MarketId; label: string };
};

export const MARKETS: Record<MarketId, Market> = {
  mt: {
    id: "mt",
    name: "Northwest Yachting",
    domain: "northwestboatmaintenance.com",
    url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://northwestboatmaintenance.com",
    tagline: "Discreet yacht care, refit and brokerage in Malta",
    region: "Malta & Gozo",
    areas: ["Grand Harbour", "Valletta", "Birgu", "Msida", "Portomaso", "Manoel Island", "Mġarr, Gozo"],
    countries: ["Malta"],
    checkoutCountries: ["MT"],
    logo: null,
    shop: false,
    luxury: true,
    sister: { id: "ie", label: "Ireland" },
  },
  ie: {
    id: "ie",
    name: "Northwest Boat Maintenance",
    domain: "ie.northwestboatmaintenance.com",
    url: process.env.NEXT_PUBLIC_IE_URL ?? "https://ie.northwestboatmaintenance.com",
    tagline: "Marine engineering, restoration & brokerage in the North West of Ireland",
    region: "North West of Ireland",
    areas: ["Donegal", "Sligo", "Leitrim", "Mayo", "Lough Erne", "Killybegs", "Mullaghmore"],
    countries: ["Ireland"],
    checkoutCountries: ["IE", "NI"],
    logo: { src: "/images/northwest-boat-maintenance-logo.png", width: 489, height: 246 },
    shop: true,
    luxury: false,
    sister: { id: "mt", label: "Malta" },
  },
};

export const MARKET_IDS = Object.keys(MARKETS) as MarketId[];

export function getMarket(id: string | undefined | null): Market {
  return MARKETS[(id as MarketId) in MARKETS ? (id as MarketId) : "mt"];
}

/** Which site a request is for, from its host name (ie.* is Ireland, everything else Malta). */
export function marketFromHost(host: string | null | undefined): MarketId {
  return host?.toLowerCase().startsWith("ie.") ? "ie" : "mt";
}

export function formatPrice(cents: number) {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}
