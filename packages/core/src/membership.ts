/**
 * Complete membership (Gold, Platinum) and Complete Points: one wallet a guest can spend at every
 * venue on Complete, whatever the venue's own loyalty programme.
 *
 * Two kinds of points, both worth €0.01 each (100 points = €1):
 * - **paid** points: bought with money at face value. They behave like a gift card, so they can pay
 *   for anything, alcohol included.
 * - **bonus** points: given free (tier perks, purchase bonuses). They are a loyalty reward, so under
 *   the Public Health (Alcohol) Act 2018 they can never pay for alcohol.
 */

export type Tier = "gold" | "platinum";
export type TierPeriod = "monthly" | "annual";

export interface TierSpec {
  name: string;
  monthlyCents: number;
  annualCents: number;
  /** extra bonus points on every points purchase, as a percentage of the points bought */
  purchaseBonusPct: number;
  /** bonus points added at the start of each paid month */
  monthlyBonusPoints: number;
  perks: string[];
}

export const TIERS: Record<Tier, TierSpec> = {
  gold: {
    name: "Gold",
    monthlyCents: 499,
    annualCents: 4900,
    purchaseBonusPct: 5,
    monthlyBonusPoints: 300,
    perks: [
      "300 bonus points (€3) every month, for food, soft drinks, songs and more",
      "5% extra points every time you top up",
      "Gold badge at every venue on Complete",
      "First to hear about events and parties",
    ],
  },
  platinum: {
    name: "Platinum",
    monthlyCents: 1299,
    annualCents: 12900,
    purchaseBonusPct: 10,
    monthlyBonusPoints: 1000,
    perks: [
      "1,000 bonus points (€10) every month, for food, soft drinks, songs and more",
      "10% extra points every time you top up",
      "Platinum badge at every venue on Complete",
      "Partner perks, like wedding offers from our wedding partner",
      "First to hear about events and parties",
    ],
  },
};

export const POINT_BUNDLES_CENTS = [1000, 2500, 5000, 10000] as const;
/** Most a guest can hold as bought points, and buy in a calendar month (keeps it a small, low-risk wallet). */
export const WALLET_MAX_PAID_CENTS = 50_000;
export const WALLET_MAX_MONTHLY_PURCHASE_CENTS = 25_000;

export class MembershipError extends Error {}

export function tierPrice(tier: Tier, period: TierPeriod) {
  const t = TIERS[tier];
  if (!t) throw new MembershipError("Unknown membership");
  return period === "annual" ? t.annualCents : t.monthlyCents;
}

/** When a membership bought now (or renewed from `from`) ends. */
export function tierEnds(from: Date, period: TierPeriod): Date {
  const d = new Date(from);
  if (period === "annual") d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

/** Points for a purchase: paid points at face value plus the tier's bonus (rounded down). */
export function pointsForPurchase(cents: number, tier: Tier | null) {
  if (!(POINT_BUNDLES_CENTS as readonly number[]).includes(cents)) throw new MembershipError("Choose €10, €25, €50 or €100");
  const bonus = tier ? Math.floor((cents * TIERS[tier].purchaseBonusPct) / 100) : 0;
  return { paid: cents, bonus };
}

/** Checks a purchase against the wallet limits. */
export function checkPurchase(cents: number, balancePaid: number, boughtThisMonth: number) {
  if (balancePaid + cents > WALLET_MAX_PAID_CENTS) throw new MembershipError(`You can hold up to €${WALLET_MAX_PAID_CENTS / 100} of bought points`);
  if (boughtThisMonth + cents > WALLET_MAX_MONTHLY_PURCHASE_CENTS) throw new MembershipError(`You can top up €${WALLET_MAX_MONTHLY_PURCHASE_CENTS / 100} a month`);
}

/**
 * How much of a bill points pay. Bonus points go on the non-alcohol part first (they can't touch
 * alcohol); paid points cover what's left, alcohol included. Never more than `dueCents`.
 */
export function walletSplit(input: { dueCents: number; nonAlcoholDueCents: number; paidBalance: number; bonusBalance: number }) {
  const due = Math.max(0, Math.round(input.dueCents));
  const nonAlc = Math.min(due, Math.max(0, Math.round(input.nonAlcoholDueCents)));
  const bonus = Math.min(Math.max(0, input.bonusBalance), nonAlc);
  const paid = Math.min(Math.max(0, input.paidBalance), due - bonus);
  return { bonusCents: bonus, paidCents: paid, totalCents: bonus + paid, remainingCents: due - bonus - paid };
}

export const tierBadge = (tier: Tier | null | undefined) => (tier ? `${TIERS[tier].name} member` : null);
