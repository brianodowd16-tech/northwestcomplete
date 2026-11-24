// Loyalty decisioning: what a member can use right now, whether an action is allowed
// (for the guest, the venue's redemption rules and any AI agent acting for them), and
// which actions to suggest first. Pure functions: callers supply all state.
import type { Balances, Level, ProgrammeRules } from "./loyalty";

/** A venue's redemption rules (set in the back office). */
export interface RedemptionRules {
  /** credit can only be used on orders of at least this much */
  creditMinOrderCents: number;
  /** whether credit and double points can be used on the same order */
  allowCreditWithDouble: boolean;
  /** cap on loyalty credit redeemed per calendar month across the venue; null for none */
  monthlyCreditBudgetCents: number | null;
  /** double points only apply to orders of at least this much */
  doubleMinOrderCents: number;
}

export const DEFAULT_REDEMPTION_RULES: RedemptionRules = {
  creditMinOrderCents: 0,
  allowCreditWithDouble: true,
  monthlyCreditBudgetCents: null,
  doubleMinOrderCents: 0,
};

export function normaliseRules(r: Partial<RedemptionRules> | null | undefined): RedemptionRules {
  const n = (v: unknown, d: number) => (Number.isInteger(v) && (v as number) >= 0 ? (v as number) : d);
  return {
    creditMinOrderCents: n(r?.creditMinOrderCents, 0),
    allowCreditWithDouble: r?.allowCreditWithDouble !== false,
    monthlyCreditBudgetCents: r?.monthlyCreditBudgetCents === null || r?.monthlyCreditBudgetCents === undefined ? null : n(r.monthlyCreditBudgetCents, 0),
    doubleMinOrderCents: n(r?.doubleMinOrderCents, 0),
  };
}

export interface MemberState {
  balances: Balances;
  spend12mCents: number;
  level: Level;
  next: Level | null;
  programme: ProgrammeRules;
}

/** What an AI agent has been allowed to do for a guest. */
export type AgentScope = "profile:read" | "benefits:read" | "orders:quote" | "points:convert" | "orders:create";
export const AGENT_SCOPES: AgentScope[] = ["profile:read", "benefits:read", "orders:quote", "points:convert", "orders:create"];

export interface AgentLimits {
  scopes: AgentScope[];
  /** largest order the agent may prepare */
  maxOrderCents: number;
  /** most credit the agent may apply to one order */
  maxCreditCents: number;
}

export interface Benefit {
  id: "credit" | "double_points" | "convert_points" | "next_level" | "birthday_credit";
  title: string;
  /** euro value in cents when it has one */
  valueCents: number | null;
  available: boolean;
  /** when not available, why */
  reason: string | null;
  conditions: string[];
}

const eur = (c: number) => `€${(c / 100).toFixed(2)}`;

/** Everything the member holds, as data an app or an AI agent can read. */
export function benefitsFor(m: MemberState, rules: RedemptionRules, creditBudgetLeftCents: number | null): Benefit[] {
  const out: Benefit[] = [];
  const creditConds = [
    ...(rules.creditMinOrderCents ? [`Orders of ${eur(rules.creditMinOrderCents)} or more`] : []),
    ...(!rules.allowCreditWithDouble ? ["Can't be combined with double points"] : []),
  ];
  out.push({
    id: "credit",
    title: `${eur(m.balances.creditCents)} credit`,
    valueCents: m.balances.creditCents,
    available: m.balances.creditCents > 0 && creditBudgetLeftCents !== 0,
    reason: m.balances.creditCents <= 0 ? "No credit yet" : creditBudgetLeftCents === 0 ? "The venue's credit allowance for this month is used up" : null,
    conditions: creditConds,
  });
  out.push({
    id: "double_points",
    title: `${m.balances.doubles} double-points order${m.balances.doubles === 1 ? "" : "s"}`,
    valueCents: null,
    available: m.balances.doubles > 0,
    reason: m.balances.doubles > 0 ? null : "None left",
    conditions: rules.doubleMinOrderCents ? [`Orders of ${eur(rules.doubleMinOrderCents)} or more`] : [],
  });
  const block = m.programme.pointsPerCreditEuro;
  const convertible = Math.floor(m.balances.points / block) * block;
  out.push({
    id: "convert_points",
    title: `Turn ${convertible.toLocaleString("en-IE")} points into ${eur((convertible / block) * 100)} credit`,
    valueCents: (convertible / block) * 100,
    available: convertible > 0,
    reason: convertible > 0 ? null : `Needs ${block} points`,
    conditions: [`${block} points = €1`],
  });
  out.push({
    id: "birthday_credit",
    title: `${eur(m.level.birthdayCreditCents)} birthday credit`,
    valueCents: m.level.birthdayCreditCents,
    available: false,
    reason: "Added automatically on your birthday",
    conditions: [`At your current level (${m.level.name})`],
  });
  if (m.next) {
    out.push({
      id: "next_level",
      title: `${m.next.name}: ${eur(m.next.minSpend12mCents - m.spend12mCents)} to go`,
      valueCents: null,
      available: false,
      reason: "Unlocks when you reach the spend",
      conditions: [
        ...(m.next.levelupPoints ? [`${m.next.levelupPoints} bonus points`] : []),
        ...(m.next.doublePointsCount ? [`${m.next.doublePointsCount} double-points orders`] : []),
        `${eur(m.next.birthdayCreditCents)} birthday credit`,
      ],
    });
  }
  return out;
}

export type Action =
  | { type: "apply_credit"; amountCents: number; orderGrossCents: number; withDouble: boolean }
  | { type: "use_double_points"; orderGrossCents: number; withCredit: boolean }
  | { type: "convert_points"; points: number }
  | { type: "quote_order"; orderGrossCents: number }
  | { type: "create_order"; orderGrossCents: number; creditCents: number };

export interface Decision {
  allowed: boolean;
  reasons: string[];
}

const SCOPE_FOR: Record<Action["type"], AgentScope> = {
  apply_credit: "orders:quote",
  use_double_points: "orders:quote",
  quote_order: "orders:quote",
  convert_points: "points:convert",
  create_order: "orders:create",
};

/**
 * Checks one action against the member's balances, the venue's rules and, when an AI
 * agent asks, the limits the guest gave it. Returns every reason it isn't allowed.
 */
export function checkEligibility(action: Action, m: MemberState, rules: RedemptionRules, creditBudgetLeftCents: number | null, agent?: AgentLimits): Decision {
  const reasons: string[] = [];
  if (agent && !agent.scopes.includes(SCOPE_FOR[action.type])) reasons.push("You haven't allowed this assistant to do that");
  switch (action.type) {
    case "apply_credit":
      if (action.amountCents <= 0) reasons.push("Nothing to apply");
      if (action.amountCents > m.balances.creditCents) reasons.push("Not enough credit");
      if (action.amountCents > action.orderGrossCents) reasons.push("Credit can't be more than the order");
      if (action.orderGrossCents < rules.creditMinOrderCents) reasons.push(`Credit needs an order of ${eur(rules.creditMinOrderCents)} or more`);
      if (creditBudgetLeftCents !== null && action.amountCents > creditBudgetLeftCents) reasons.push("The venue's credit allowance for this month is used up");
      if (action.withDouble && !rules.allowCreditWithDouble) reasons.push("Credit can't be combined with double points here");
      if (agent && action.amountCents > agent.maxCreditCents) reasons.push(`Above the ${eur(agent.maxCreditCents)} credit limit you set for this assistant`);
      break;
    case "use_double_points":
      if (m.balances.doubles <= 0) reasons.push("No double-points orders left");
      if (action.orderGrossCents < rules.doubleMinOrderCents) reasons.push(`Double points need an order of ${eur(rules.doubleMinOrderCents)} or more`);
      if (action.withCredit && !rules.allowCreditWithDouble) reasons.push("Double points can't be combined with credit here");
      break;
    case "convert_points":
      if (!Number.isInteger(action.points) || action.points <= 0) reasons.push("Choose how many points");
      else if (action.points > m.balances.points) reasons.push("Not enough points");
      else if (action.points % m.programme.pointsPerCreditEuro !== 0) reasons.push(`Convert in blocks of ${m.programme.pointsPerCreditEuro} points`);
      break;
    case "quote_order":
    case "create_order":
      if (agent && action.orderGrossCents > agent.maxOrderCents) reasons.push(`Above the ${eur(agent.maxOrderCents)} order limit you set for this assistant`);
      if (action.type === "create_order" && agent && action.creditCents > agent.maxCreditCents) reasons.push(`Above the ${eur(agent.maxCreditCents)} credit limit you set for this assistant`);
      break;
  }
  return { allowed: reasons.length === 0, reasons };
}

/**
 * Applies the venue's rules to what a guest asked for at checkout and returns what
 * actually applies. The server always calls this; the browser's choice is a request.
 */
export function resolveRedemption(
  req: { wantCredit: boolean; wantDouble: boolean },
  orderGrossCents: number,
  m: Pick<MemberState, "balances">,
  rules: RedemptionRules,
  creditBudgetLeftCents: number | null,
): { creditCents: number; useDouble: boolean } {
  let credit = 0;
  if (req.wantCredit && orderGrossCents >= rules.creditMinOrderCents) {
    credit = Math.max(0, Math.min(m.balances.creditCents, orderGrossCents, creditBudgetLeftCents ?? Number.MAX_SAFE_INTEGER));
  }
  let useDouble = req.wantDouble && m.balances.doubles > 0 && orderGrossCents >= rules.doubleMinOrderCents;
  // When they can't stack, credit wins: it's money, double points are a bonus.
  if (credit > 0 && useDouble && !rules.allowCreditWithDouble) useDouble = false;
  return { creditCents: credit, useDouble };
}

export interface Suggestion {
  kind: "use_credit" | "use_double" | "convert_points" | "level_up" | "join";
  title: string;
  why: string;
  score: number;
}

/** Ranks what's worth doing next for this guest, best first. */
export function nextBestActions(m: MemberState | null, rules: RedemptionRules, basketGrossCents: number, creditBudgetLeftCents: number | null): Suggestion[] {
  if (!m) return [{ kind: "join", title: "Join and get credit", why: "Free to join, with credit on sign-up and points on every order", score: 100 }];
  const out: Suggestion[] = [];
  const block = m.programme.pointsPerCreditEuro;
  if (m.balances.creditCents > 0 && basketGrossCents >= rules.creditMinOrderCents && creditBudgetLeftCents !== 0) {
    const use = Math.min(m.balances.creditCents, basketGrossCents || m.balances.creditCents);
    out.push({ kind: "use_credit", title: `Use ${eur(use)} credit`, why: "Credit you already have, off this order", score: 60 + use / 100 });
  }
  if (m.balances.doubles > 0 && basketGrossCents >= Math.max(rules.doubleMinOrderCents, 1500)) {
    const extra = Math.floor((basketGrossCents * m.programme.pointsPerEuro) / 100);
    out.push({ kind: "use_double", title: `Double points: +${extra} extra`, why: "A bigger order is the best time to double up", score: 40 + extra / 20 });
  }
  if (m.balances.points >= block) {
    const pts = Math.floor(m.balances.points / block) * block;
    out.push({ kind: "convert_points", title: `Turn ${pts} points into ${eur((pts / block) * 100)}`, why: "Points become credit you can spend today", score: 30 + pts / block });
  }
  if (m.next) {
    const gap = m.next.minSpend12mCents - m.spend12mCents;
    if (gap > 0 && gap <= Math.max(5000, basketGrossCents * 2)) {
      out.push({ kind: "level_up", title: `${eur(gap)} from ${m.next.name}`, why: `${m.next.name} adds ${m.next.levelupPoints} bonus points`, score: 50 - gap / 200 });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

export interface Recommendation {
  itemId: string;
  reason: "your_usual" | "goes_with" | "popular";
  /** for goes_with, the basket item it pairs with */
  withItemId?: string;
}

/**
 * Suggests menu items: the guest's usual, things often ordered with what's in the
 * basket, then what's popular here. Only available items, never already in the basket.
 */
export function recommendItems(input: {
  available: Set<string>;
  basket: Set<string>;
  history: { itemId: string; qty: number }[];
  pairs: { a: string; b: string; count: number }[];
  popular: { itemId: string; qty: number }[];
  limit?: number;
}): Recommendation[] {
  const out: Recommendation[] = [];
  const taken = new Set(input.basket);
  const push = (r: Recommendation) => {
    if (!input.available.has(r.itemId) || taken.has(r.itemId)) return;
    taken.add(r.itemId);
    out.push(r);
  };
  const usual = new Map<string, number>();
  for (const h of input.history) usual.set(h.itemId, (usual.get(h.itemId) ?? 0) + h.qty);
  [...usual.entries()].filter(([, q]) => q >= 2).sort((a, b) => b[1] - a[1]).forEach(([itemId]) => push({ itemId, reason: "your_usual" }));
  for (const p of [...input.pairs].sort((a, b) => b.count - a.count)) {
    if (p.count < 2) continue;
    if (input.basket.has(p.a)) push({ itemId: p.b, reason: "goes_with", withItemId: p.a });
    if (input.basket.has(p.b)) push({ itemId: p.a, reason: "goes_with", withItemId: p.b });
  }
  [...input.popular].sort((a, b) => b.qty - a.qty).forEach((p) => push({ itemId: p.itemId, reason: "popular" }));
  return out.slice(0, input.limit ?? 4);
}
