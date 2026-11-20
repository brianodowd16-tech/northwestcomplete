/** Money helpers. Amounts are handled as integer cents to avoid float drift. */

export function toCents(value: string | number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`Not a money amount: ${value}`);
  return Math.round(n * 100);
}

/** "1234.50" — the format myPOS expects (dot, two decimals, no grouping). */
export function centsToDecimal(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** WooCommerce Store API prices are integer strings in minor units. */
export function minorToCents(value: string, minorUnit: number): number {
  const n = Number(value);
  return minorUnit >= 2 ? Math.round(n / 10 ** (minorUnit - 2)) : n * 10 ** (2 - minorUnit);
}

const formatters = new Map<string, Intl.NumberFormat>();

export function formatPrice(cents: number, currency = "EUR"): string {
  const whole = cents % 100 === 0;
  const key = `${currency}:${whole}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat("en-IE", {
      style: "currency",
      currency,
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: 2,
    });
    formatters.set(key, f);
  }
  return f.format(cents / 100);
}
