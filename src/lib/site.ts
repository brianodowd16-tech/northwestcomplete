export const site = {
  name: "Northwest Boat Maintenance",
  domain: "northwestboatmaintenance.com",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://northwestboatmaintenance.com",
  tagline: "Marine engineering, restoration & brokerage in the North West of Ireland",
  email: "info@northwestboatmaintenance.com",
  phone: "+353 (0)00 000 0000",
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
