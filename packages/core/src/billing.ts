import { divRoundHalfUp } from "./money";

export const FEE_VAT_RATE = 23;

export interface StatementInput {
  appGrossCents: number;
  appRefundsCents: number;
  /** basis points: 100 = 1% */
  appFeeBps: number;
  subscriptionCents: number;
}

export interface Statement extends StatementInput {
  netAppCents: number;
  appFeeCents: number;
  feesExVatCents: number;
  vatCents: number;
  totalCents: number;
}

/** Monthly statement: subscription + app fee on net app payments, plus VAT on Round's fees. */
export function buildStatement(input: StatementInput): Statement {
  const netAppCents = Math.max(0, input.appGrossCents - input.appRefundsCents);
  const appFeeCents = divRoundHalfUp(netAppCents * input.appFeeBps, 10_000);
  const feesExVatCents = appFeeCents + input.subscriptionCents;
  const vatCents = divRoundHalfUp(feesExVatCents * FEE_VAT_RATE, 100);
  return { ...input, netAppCents, appFeeCents, feesExVatCents, vatCents, totalCents: feesExVatCents + vatCents };
}
