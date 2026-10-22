// All money is integer cents. Prices are VAT-inclusive.

export type VatRate = 9 | 23;

/** Divide and round half-up. Both arguments must be non-negative integers, den > 0. */
export function divRoundHalfUp(num: number, den: number): number {
  return Math.floor((2 * num + den) / (2 * den));
}

/** VAT contained in a VAT-inclusive gross amount, rounded half-up to the cent. */
export function vatFromGross(grossCents: number, rate: VatRate): number {
  if (!Number.isInteger(grossCents) || grossCents < 0) throw new Error("gross must be non-negative integer cents");
  return divRoundHalfUp(grossCents * rate, 100 + rate);
}

export function formatEur(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}€${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
