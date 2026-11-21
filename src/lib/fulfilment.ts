/**
 * Fulfilment options offered at checkout.
 *
 * Today the only option is Click & Collect. Courier partners plug in here
 * later: add a provider with `enabled: true` and (optionally) a `quote()` that
 * prices the basket for an address. Checkout, validation and the WooCommerce
 * shipping line all read from this registry, so nothing else needs to change.
 */

export type FulfilmentQuoteInput = {
  items: { productId: number; quantity: number; unitCents: number }[];
  address: { city: string; county: string; eircode: string; country: string };
};

export type FulfilmentOption = {
  id: string;
  label: string;
  description: string;
  /** WooCommerce shipping method id written to the order. */
  wooMethodId: string;
  enabled: boolean;
  /** Price in cents for this basket/address. Omit for free options. */
  quote?: (input: FulfilmentQuoteInput) => Promise<number>;
};

export const FULFILMENT_OPTIONS: FulfilmentOption[] = [
  {
    id: "collect",
    label: "Click & Collect",
    description: "Collect from our Station Road showroom in Carrick-on-Shannon. We'll email you as soon as your order is ready.",
    wooMethodId: "local_pickup",
    enabled: true,
  },
  // Courier partners, e.g.
  // { id: "courier-standard", label: "Nationwide delivery", wooMethodId: "flat_rate", enabled: false, quote: async (i) => ... },
];

export const enabledFulfilment = () => FULFILMENT_OPTIONS.filter((o) => o.enabled);
export const getFulfilment = (id: string) => enabledFulfilment().find((o) => o.id === id);
