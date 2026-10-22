// Loyalty engine. Every change is a ledger entry; balances are always derived.

export type LedgerKind = "points" | "credit" | "double";

export interface LedgerEntry {
  kind: LedgerKind;
  /** points, credit cents, or double-points tokens */
  delta: number;
  reason: string;
  orderId?: string | null;
}

export interface ProgrammeRules {
  pointsPerEuro: number;
  /** points needed for €1 of credit */
  pointsPerCreditEuro: number;
  signupCreditCents: number;
  referralPoints: number;
}

export interface Level {
  name: string;
  minSpend12mCents: number;
  levelupPoints: number;
  doublePointsCount: number;
  birthdayCreditCents: number;
}

export interface Balances {
  points: number;
  creditCents: number;
  doubles: number;
}

export function balances(entries: Pick<LedgerEntry, "kind" | "delta">[]): Balances {
  const b: Balances = { points: 0, creditCents: 0, doubles: 0 };
  for (const e of entries) {
    if (e.kind === "points") b.points += e.delta;
    else if (e.kind === "credit") b.creditCents += e.delta;
    else b.doubles += e.delta;
  }
  return b;
}

/** Highest level whose threshold the spend reaches. Levels may be unsorted. */
export function levelFor(levels: Level[], spend12mCents: number): Level {
  const sorted = [...levels].sort((a, b) => a.minSpend12mCents - b.minSpend12mCents);
  let current = sorted[0];
  for (const l of sorted) if (spend12mCents >= l.minSpend12mCents) current = l;
  return current;
}

export function nextLevel(levels: Level[], spend12mCents: number): Level | null {
  const sorted = [...levels].sort((a, b) => a.minSpend12mCents - b.minSpend12mCents);
  return sorted.find((l) => l.minSpend12mCents > spend12mCents) ?? null;
}

export function signupEntries(rules: ProgrammeRules): LedgerEntry[] {
  return rules.signupCreditCents > 0 ? [{ kind: "credit", delta: rules.signupCreditCents, reason: "signup" }] : [];
}

export class LoyaltyError extends Error {}

/** How much credit can be applied to an order: never more than the balance or the order. */
export function creditToApply(requestedCents: number, balanceCents: number, orderGrossCents: number): number {
  return Math.max(0, Math.min(requestedCents, balanceCents, orderGrossCents));
}

export interface SettleOrderInput {
  orderId: string;
  rules: ProgrammeRules;
  levels: Level[];
  /** rolling 12-month card spend before this order */
  spend12mBeforeCents: number;
  /** card-paid amount: the only part that earns */
  amountPaidCents: number;
  creditUsedCents: number;
  useDouble: boolean;
  balancesBefore: Balances;
}

/** Ledger entries to write when an app order is paid. */
export function settleOrder(input: SettleOrderInput): LedgerEntry[] {
  const { orderId, rules, levels, balancesBefore: b } = input;
  const out: LedgerEntry[] = [];

  if (input.creditUsedCents > 0) {
    if (input.creditUsedCents > b.creditCents) throw new LoyaltyError("Not enough credit");
    out.push({ kind: "credit", delta: -input.creditUsedCents, reason: "redeem", orderId });
  }

  let points = Math.floor((input.amountPaidCents * rules.pointsPerEuro) / 100);
  if (input.useDouble && b.doubles > 0 && points > 0) {
    points *= 2;
    out.push({ kind: "double", delta: -1, reason: "use", orderId });
  }
  if (points > 0) out.push({ kind: "points", delta: points, reason: "earn", orderId });

  const before = levelFor(levels, input.spend12mBeforeCents);
  const after = levelFor(levels, input.spend12mBeforeCents + input.amountPaidCents);
  if (after.minSpend12mCents > before.minSpend12mCents) {
    // Award every level crossed, in order, so a big order can't skip a bonus.
    const crossed = levels
      .filter((l) => l.minSpend12mCents > before.minSpend12mCents && l.minSpend12mCents <= after.minSpend12mCents)
      .sort((a, c) => a.minSpend12mCents - c.minSpend12mCents);
    for (const l of crossed) {
      if (l.levelupPoints > 0) out.push({ kind: "points", delta: l.levelupPoints, reason: `levelup:${l.name}`, orderId });
      if (l.doublePointsCount > 0) out.push({ kind: "double", delta: l.doublePointsCount, reason: `levelup:${l.name}`, orderId });
    }
  }
  return out;
}

/** Entries that reverse an order's ledger lines (for refunds). */
export function reverseEntries(orderEntries: LedgerEntry[], orderId: string): LedgerEntry[] {
  return orderEntries.map((e) => ({ kind: e.kind, delta: -e.delta, reason: `refund:${e.reason}`, orderId }));
}

/** Converts points to credit. Only whole euros of credit are issued. */
export function convertPoints(rules: ProgrammeRules, pointsBalance: number, points: number): LedgerEntry[] {
  if (!Number.isInteger(points) || points <= 0) throw new LoyaltyError("Invalid points");
  if (points > pointsBalance) throw new LoyaltyError("Not enough points");
  if (points % rules.pointsPerCreditEuro !== 0) throw new LoyaltyError(`Convert in blocks of ${rules.pointsPerCreditEuro} points`);
  const creditCents = (points / rules.pointsPerCreditEuro) * 100;
  return [
    { kind: "points", delta: -points, reason: "convert" },
    { kind: "credit", delta: creditCents, reason: "convert" },
  ];
}
