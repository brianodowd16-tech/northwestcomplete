export const site = {
  name: "Northwest Boat Maintenance",
  domain: "northwestboatmaintenance.com",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://northwestboatmaintenance.com",
  tagline: "Marine engineering, restoration & brokerage in the North West of Ireland",
  email: "brian@northwestboatmaintenance.com",
  phone: "+353 86 452 3131",
  contactName: "Brían",
  /** WhatsApp click-to-chat link (number in international format, digits only). */
  whatsapp: "https://wa.me/353864523131",
  region: "North West of Ireland — Donegal, Sligo, Leitrim & Mayo",
  areas: ["Donegal", "Sligo", "Leitrim", "Mayo", "Lough Erne", "Lough Gill", "Killybegs", "Mullaghmore"],
  currency: "eur",
  vatRate: 0.23,
};

export function formatPrice(cents: number) {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}
