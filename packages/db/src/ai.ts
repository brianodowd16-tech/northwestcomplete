// AI shopping: machine-readable benefits, recommendations, and AI assistants that act
// for a guest within the scopes and limits the guest set. Every assistant request is
// checked against the decision engine and recorded in agent_action.
import {
  AGENT_SCOPES,
  benefitsFor,
  checkEligibility,
  nextBestActions,
  normaliseRules,
  priceCart,
  recommendItems,
  resolveRedemption,
  alcoholSplit,
  type AgentLimits,
  type AgentScope,
  type MemberState,
  type PaymentProvider,
  type PricedMenuItem,
  type RedemptionRules,
} from "@round/core";
import { and, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { systemDb, withTenant } from "./index";
import * as t from "./schema";
import {
  convertMemberPoints,
  createOrder,
  creditBudgetLeftTx,
  customerById,
  dashboard,
  salesSummary,
  Forbidden,
  memberSummary,
  menu,
  NotFound,
  venueById,
  type Customer,
  type Venue,
} from "./services";

// ---------------------------------------------------------------- rules and benefits

export async function redemptionRules(venue: Venue): Promise<RedemptionRules> {
  return withTenant(venue.tenantId, async (tx) => {
    const [p] = await tx.select().from(t.programme).where(eq(t.programme.id, venue.programmeId));
    return normaliseRules(p.redemptionRules);
  });
}

export async function saveRedemptionRules(venue: Venue, rules: RedemptionRules) {
  await withTenant(venue.tenantId, (tx) => tx.update(t.programme).set({ redemptionRules: { ...rules } }).where(eq(t.programme.id, venue.programmeId)));
}

async function budgetLeft(venue: Venue, rules: RedemptionRules) {
  return withTenant(venue.tenantId, (tx) => creditBudgetLeftTx(tx, venue, rules.monthlyCreditBudgetCents));
}

export async function memberState(venue: Venue, customerId: string): Promise<MemberState> {
  const s = await memberSummary(venue, customerId);
  return { balances: s.balances, spend12mCents: s.spend12mCents, level: s.level, next: s.next, programme: s.programme };
}

/** The guest's benefits as data, plus ranked suggestions for a basket of this size. */
export async function guestBenefits(venue: Venue, customerId: string | null, basketGrossCents = 0) {
  const rules = await redemptionRules(venue);
  const left = await budgetLeft(venue, rules);
  const m = customerId ? await memberState(venue, customerId) : null;
  return { rules, benefits: m ? benefitsFor(m, rules, left) : [], suggestions: nextBestActions(m, rules, basketGrossCents, left) };
}

// ---------------------------------------------------------------- recommendations

/** "Your usual", "goes with" and "popular here", from real orders at this venue. */
export async function recommendationsFor(venue: Venue, customerId: string | null, basketItemIds: string[]) {
  const cats = await menu(venue);
  const items = cats.flatMap((c) => c.items);
  const available = new Set(items.filter((i) => !i.soldOut).map((i) => i.id));
  const recs = await withTenant(venue.tenantId, async (tx) => {
    const since = new Date(Date.now() - 60 * 86_400_000);
    const orders = await tx
      .select({ id: t.orders.id, customerId: t.orders.customerId })
      .from(t.orders)
      .where(and(eq(t.orders.venueId, venue.id), eq(t.orders.status, "paid"), gte(t.orders.paidAt, since)))
      .orderBy(desc(t.orders.paidAt))
      .limit(500);
    const lines = orders.length ? await tx.select().from(t.orderLine).where(inArray(t.orderLine.orderId, orders.map((o) => o.id))) : [];
    const byOrder = new Map<string, string[]>();
    for (const l of lines) byOrder.set(l.orderId, [...(byOrder.get(l.orderId) ?? []), l.menuItemId]);
    const pairCount = new Map<string, number>();
    for (const ids of byOrder.values()) {
      const u = [...new Set(ids)];
      for (let i = 0; i < u.length; i++) for (let j = i + 1; j < u.length; j++) {
        const k = [u[i], u[j]].sort().join("|");
        pairCount.set(k, (pairCount.get(k) ?? 0) + 1);
      }
    }
    const popular = new Map<string, number>();
    for (const l of lines) popular.set(l.menuItemId, (popular.get(l.menuItemId) ?? 0) + l.qty);
    const mine = new Set(orders.filter((o) => o.customerId === customerId).map((o) => o.id));
    return recommendItems({
      available,
      basket: new Set(basketItemIds),
      history: lines.filter((l) => mine.has(l.orderId)).map((l) => ({ itemId: l.menuItemId, qty: l.qty })),
      pairs: [...pairCount.entries()].map(([k, count]) => {
        const [a, b] = k.split("|");
        return { a, b, count };
      }),
      popular: [...popular.entries()].map(([itemId, qty]) => ({ itemId, qty })),
    });
  });
  const byId = new Map(items.map((i) => [i.id, i]));
  return recs.map((r) => ({ ...r, item: byId.get(r.itemId)!, withName: r.withItemId ? byId.get(r.withItemId)?.name ?? null : null }));
}

// ---------------------------------------------------------------- grants

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export interface GrantInput {
  name: string;
  scopes: AgentScope[];
  maxOrderCents: number;
  maxCreditCents: number;
  days: number;
}

/** Creates an assistant connection. The token is returned once and never stored. */
export async function createGrant(venue: Venue, customerId: string, g: GrantInput) {
  const scopes = g.scopes.filter((s) => AGENT_SCOPES.includes(s));
  if (!scopes.length) throw new Forbidden("Choose at least one thing the assistant may do");
  const name = g.name.trim().slice(0, 40) || "My assistant";
  const days = Math.min(Math.max(Math.round(g.days), 1), 365);
  const token = `cpl_${randomBytes(24).toString("base64url")}`;
  await withTenant(venue.tenantId, (tx) =>
    tx.insert(t.agentGrant).values({
      tenantId: venue.tenantId,
      venueId: venue.id,
      customerId,
      name,
      tokenHash: hashToken(token),
      tokenHint: token.slice(-4),
      scopes,
      maxOrderCents: Math.max(0, Math.round(g.maxOrderCents)),
      maxCreditCents: Math.max(0, Math.round(g.maxCreditCents)),
      expiresAt: new Date(Date.now() + days * 86_400_000),
    }),
  );
  return token;
}

export async function listGrants(venue: Venue, customerId: string) {
  return withTenant(venue.tenantId, (tx) =>
    tx.select().from(t.agentGrant).where(and(eq(t.agentGrant.venueId, venue.id), eq(t.agentGrant.customerId, customerId))).orderBy(desc(t.agentGrant.createdAt)),
  );
}

export async function revokeGrant(venue: Venue, customerId: string, grantId: string) {
  const res = await withTenant(venue.tenantId, (tx) =>
    tx
      .update(t.agentGrant)
      .set({ revokedAt: new Date() })
      .where(and(eq(t.agentGrant.id, grantId), eq(t.agentGrant.customerId, customerId), isNull(t.agentGrant.revokedAt)))
      .returning({ id: t.agentGrant.id }),
  );
  if (!res.length) throw new NotFound("Connection not found");
}

/** Stand-in provider for held orders: createOrder returns before using it. */
const HELD: PaymentProvider = {
  name: "mock",
  publicKey: null,
  getOrder: null,
  createOrder: async () => {
    throw new Error("Held orders are paid on approval");
  },
  refund: async () => {},
  verifyWebhook: () => false,
  parseWebhook: () => ({ event: "", providerOrderId: "" }),
};

export type Grant = typeof t.agentGrant.$inferSelect;
export interface AgentContext {
  grant: Grant;
  venue: Venue;
  customer: Customer;
}

export class AgentAuthError extends Error {}

/** Resolves a bearer token to its grant, venue and guest. Expired or revoked tokens fail. */
export async function authenticateAgent(token: string | null): Promise<AgentContext> {
  if (!token || !token.startsWith("cpl_")) throw new AgentAuthError("Missing or malformed token");
  const [grant] = await systemDb().select().from(t.agentGrant).where(eq(t.agentGrant.tokenHash, hashToken(token)));
  if (!grant || grant.revokedAt || grant.expiresAt < new Date()) throw new AgentAuthError("This connection has expired or been switched off");
  const [venue, customer] = await Promise.all([venueById(grant.venueId), customerById(grant.customerId)]);
  if (!customer) throw new AgentAuthError("Guest not found");
  await systemDb().update(t.agentGrant).set({ lastUsedAt: new Date() }).where(eq(t.agentGrant.id, grant.id));
  return { grant, venue, customer };
}

const limitsOf = (g: Grant): AgentLimits => ({ scopes: g.scopes as AgentScope[], maxOrderCents: g.maxOrderCents, maxCreditCents: g.maxCreditCents });

async function audit(ctx: AgentContext, tool: string, input: unknown, allowed: boolean, reasons: string[], outcome: string | null) {
  await withTenant(ctx.venue.tenantId, (tx) =>
    tx.insert(t.agentAction).values({ tenantId: ctx.venue.tenantId, venueId: ctx.venue.id, grantId: ctx.grant.id, customerId: ctx.customer.id, tool, input: (input ?? null) as object, allowed, reasons, outcome }),
  );
}

export async function agentActivity(venue: Venue, opts: { customerId?: string; limit?: number } = {}) {
  return withTenant(venue.tenantId, async (tx) => {
    const rows = await tx
      .select({ a: t.agentAction, grantName: t.agentGrant.name })
      .from(t.agentAction)
      .innerJoin(t.agentGrant, eq(t.agentGrant.id, t.agentAction.grantId))
      .where(and(eq(t.agentAction.venueId, venue.id), opts.customerId ? eq(t.agentAction.customerId, opts.customerId) : undefined))
      .orderBy(desc(t.agentAction.createdAt))
      .limit(opts.limit ?? 50);
    return rows.map((r) => ({ ...r.a, grantName: r.grantName }));
  });
}

// ---------------------------------------------------------------- agent tools

export interface ToolSpec {
  name: string;
  description: string;
  scope: AgentScope;
  inputSchema: Record<string, unknown>;
}

const LINES_SCHEMA = {
  type: "array",
  items: { type: "object", properties: { item_id: { type: "string" }, qty: { type: "integer", minimum: 1, maximum: 20 } }, required: ["item_id", "qty"] },
};

/** The tools an AI assistant can call (served over MCP and REST). */
export const AGENT_TOOLS: ToolSpec[] = [
  { name: "get_profile", scope: "profile:read", description: "The guest's membership: level, points, credit, progress to the next level and recent orders at this venue.", inputSchema: { type: "object", properties: {} } },
  { name: "list_benefits", scope: "benefits:read", description: "Everything the guest can use right now (credit, double points, points conversion), with value, conditions and why anything is unavailable, plus suggested next actions.", inputSchema: { type: "object", properties: { basket_total_cents: { type: "integer", minimum: 0 } } } },
  { name: "get_menu", scope: "orders:quote", description: "The venue's menu with item IDs, prices (VAT-inclusive, cents), and what's sold out.", inputSchema: { type: "object", properties: {} } },
  { name: "recommend_items", scope: "benefits:read", description: "Personal suggestions: the guest's usual, items often ordered with the basket, and what's popular here.", inputSchema: { type: "object", properties: { basket_item_ids: { type: "array", items: { type: "string" } } } } },
  { name: "check_eligibility", scope: "benefits:read", description: "Checks whether an action is allowed right now and why not: apply_credit, use_double_points, convert_points.", inputSchema: { type: "object", properties: { action: { type: "string", enum: ["apply_credit", "use_double_points", "convert_points"] }, amount_cents: { type: "integer" }, points: { type: "integer" }, order_total_cents: { type: "integer" }, with_double: { type: "boolean" }, with_credit: { type: "boolean" } }, required: ["action"] } },
  { name: "quote_order", scope: "orders:quote", description: "Prices a basket with the best allowed credit and double points, within the guest's limits. Nothing is ordered.", inputSchema: { type: "object", properties: { lines: LINES_SCHEMA, use_credit: { type: "boolean" }, use_double_points: { type: "boolean" } }, required: ["lines"] } },
  { name: "convert_points", scope: "points:convert", description: "Turns points into credit (in whole blocks).", inputSchema: { type: "object", properties: { points: { type: "integer", minimum: 1 } }, required: ["points"] } },
  { name: "start_order", scope: "orders:create", description: "Prepares a drinks order to collect at the bar. It waits for the guest to approve and pay in the app; returns the approval link.", inputSchema: { type: "object", properties: { lines: LINES_SCHEMA, use_credit: { type: "boolean" }, use_double_points: { type: "boolean" } }, required: ["lines"] } },
];

type Args = Record<string, unknown>;
const int = (v: unknown, d = 0) => (Number.isInteger(v) ? (v as number) : d);
const lineArgs = (a: Args) =>
  Array.isArray(a.lines) ? (a.lines as Args[]).map((l) => ({ menuItemId: String(l.item_id ?? ""), qty: int(l.qty) })) : [];

async function priced(venue: Venue, lines: { menuItemId: string; qty: number }[], channel: "table" | "collect") {
  const items = (await menu(venue)).flatMap((c) => c.items);
  const map = new Map<string, PricedMenuItem>(items.map((i) => [i.id, { id: i.id, name: i.name, priceCents: i.priceCents, vatRate: i.vatRate, station: i.station, containsAlcohol: i.containsAlcohol, availableForCollect: i.availableForCollect, active: i.active, soldOut: i.soldOut }]));
  return priceCart(map, lines, channel);
}

export interface ToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
  reasons?: string[];
}

/**
 * Runs one assistant tool for an authenticated grant. Scope and limits are checked by
 * the decision engine first; the decision and outcome are always recorded.
 */
export async function runAgentTool(ctx: AgentContext, name: string, args: Args, appUrl: string): Promise<ToolResult> {
  const spec = AGENT_TOOLS.find((x) => x.name === name);
  if (!spec) return { ok: false, error: `Unknown tool ${name}` };
  const limits = limitsOf(ctx.grant);
  const { venue, customer } = ctx;
  const deny = async (reasons: string[]) => {
    await audit(ctx, name, args, false, reasons, null);
    return { ok: false, error: reasons[0], reasons };
  };
  if (!limits.scopes.includes(spec.scope)) return deny(["You haven't allowed this assistant to do that"]);

  try {
    const rules = await redemptionRules(venue);
    const left = await budgetLeft(venue, rules);
    const m = await memberState(venue, customer.id);

    switch (name) {
      case "get_profile": {
        const recent = await withTenant(venue.tenantId, (tx) =>
          tx.select({ number: t.orders.number, grossCents: t.orders.grossCents, paidAt: t.orders.paidAt }).from(t.orders).where(and(eq(t.orders.customerId, customer.id), eq(t.orders.venueId, venue.id), eq(t.orders.status, "paid"))).orderBy(desc(t.orders.paidAt)).limit(5),
        );
        const data = {
          venue: venue.name,
          first_name: customer.name.split(" ")[0],
          level: m.level.name,
          next_level: m.next ? { name: m.next.name, spend_to_go_cents: m.next.minSpend12mCents - m.spend12mCents } : null,
          points: m.balances.points,
          credit_cents: m.balances.creditCents,
          double_points_orders: m.balances.doubles,
          id_checked: !!customer.ageVerifiedAt,
          recent_orders: recent,
          limits: { max_order_cents: limits.maxOrderCents, max_credit_cents: limits.maxCreditCents, allowed: limits.scopes },
        };
        await audit(ctx, name, args, true, [], "profile shared");
        return { ok: true, data };
      }
      case "list_benefits": {
        const data = { benefits: benefitsFor(m, rules, left), suggestions: nextBestActions(m, rules, int(args.basket_total_cents), left) };
        await audit(ctx, name, args, true, [], `${data.benefits.filter((b) => b.available).length} available`);
        return { ok: true, data };
      }
      case "get_menu": {
        const cats = await menu(venue);
        const data = cats.map((c) => ({ section: c.name, items: c.items.map((i) => ({ item_id: i.id, name: i.name, price_cents: i.priceCents, station: i.station, collectable: i.availableForCollect, alcohol: i.containsAlcohol, sold_out: i.soldOut })) }));
        await audit(ctx, name, args, true, [], "menu shared");
        return { ok: true, data };
      }
      case "recommend_items": {
        const ids = Array.isArray(args.basket_item_ids) ? (args.basket_item_ids as unknown[]).map(String) : [];
        const recs = await recommendationsFor(venue, customer.id, ids);
        await audit(ctx, name, args, true, [], `${recs.length} suggestions`);
        return { ok: true, data: recs.map((r) => ({ item_id: r.itemId, name: r.item.name, price_cents: r.item.priceCents, reason: r.reason, goes_with: r.withName })) };
      }
      case "check_eligibility": {
        const total = int(args.order_total_cents);
        const action =
          args.action === "apply_credit"
            ? { type: "apply_credit" as const, amountCents: int(args.amount_cents), orderGrossCents: total, withDouble: args.with_double === true }
            : args.action === "use_double_points"
              ? { type: "use_double_points" as const, orderGrossCents: total, withCredit: args.with_credit === true }
              : { type: "convert_points" as const, points: int(args.points) };
        const d = checkEligibility(action, m, rules, left, limits);
        await audit(ctx, name, args, true, d.reasons, d.allowed ? "allowed" : "not allowed");
        return { ok: true, data: d };
      }
      case "quote_order":
      case "start_order": {
        const lines = lineArgs(args);
        const cart = await priced(venue, lines, "collect");
        const r = resolveRedemption({ wantCredit: args.use_credit !== false, wantDouble: args.use_double_points === true }, cart.grossCents, m, rules, left);
        // No loyalty credit on alcohol (Irish law).
        const credit = alcoholSplit(cart.lines.map((l) => ({ grossCents: l.grossCents, containsAlcohol: l.menuItem.containsAlcohol })), Math.min(r.creditCents, limits.maxCreditCents)).creditCents;
        const check = checkEligibility(name === "quote_order" ? { type: "quote_order", orderGrossCents: cart.grossCents } : { type: "create_order", orderGrossCents: cart.grossCents, creditCents: credit }, m, rules, left, limits);
        if (!check.allowed) return deny(check.reasons);
        const toPay = cart.grossCents - credit;
        const quote = {
          lines: cart.lines.map((l) => ({ item_id: l.menuItem.id, name: l.menuItem.name, qty: l.qty, total_cents: l.grossCents })),
          total_cents: cart.grossCents,
          credit_cents: credit,
          to_pay_cents: toPay,
          double_points: r.useDouble,
          points_to_earn: Math.floor((toPay * m.programme.pointsPerEuro) / 100) * (r.useDouble ? 2 : 1),
          id_check_needed: cart.containsAlcohol && !customer.ageVerifiedAt,
        };
        if (name === "quote_order") {
          await audit(ctx, name, args, true, [], `quoted ${quote.to_pay_cents}c`);
          return { ok: true, data: quote };
        }
        const { order } = await createOrder(
          {
            venue,
            customer,
            channel: "collect",
            tableId: null,
            lines,
            creditRequestedCents: credit,
            useDouble: r.useDouble,
            idempotencyKey: `agent:${ctx.grant.id}:${randomBytes(8).toString("hex")}`,
            appUrl,
            holdForApproval: true,
          },
          // Held for approval, so no provider is contacted; the guest pays in the app later.
          HELD,
        );
        const approveUrl = `${appUrl}/v/${venue.slug}/order/${order.id}`;
        await audit(ctx, name, args, true, [], `order #${order.number} waiting for approval`);
        return { ok: true, data: { ...quote, order_number: order.number, status: "waiting_for_guest_approval", approve_url: approveUrl } };
      }
      case "convert_points": {
        const pts = int(args.points);
        const d = checkEligibility({ type: "convert_points", points: pts }, m, rules, left, limits);
        if (!d.allowed) return deny(d.reasons);
        await convertMemberPoints(venue, customer.id, pts);
        await audit(ctx, name, args, true, [], `converted ${pts} points`);
        return { ok: true, data: { converted_points: pts, credit_added_cents: (pts / m.programme.pointsPerCreditEuro) * 100 } };
      }
    }
    return { ok: false, error: "Not implemented" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await audit(ctx, name, args, false, [msg], "error");
    return { ok: false, error: msg };
  }
}

// ---------------------------------------------------------------- venue AI assistant data

/**
 * A compact, venue-scoped snapshot of the numbers a manager might ask about. It is the
 * only data the venue's AI assistant sees: no guest names, phones or emails.
 */
export async function venueSnapshot(venue: Venue) {
  const end = new Date();
  end.setHours(24, 0, 0, 0);
  const day = 86_400_000;
  const [today, week, month, rules] = await Promise.all([
    dashboard(venue, new Date(end.getTime() - day), end),
    dashboard(venue, new Date(end.getTime() - 7 * day), end),
    dashboard(venue, new Date(end.getTime() - 30 * day), end),
    redemptionRules(venue),
  ]);
  const yesterday = await salesSummary(venue, new Date(end.getTime() - 2 * day), new Date(end.getTime() - day));
  const activity = await agentActivity(venue, { limit: 200 });
  const pick = (s: Awaited<ReturnType<typeof salesSummary>>) => ({
    orders: s.orders,
    sales_cents: s.grossCents,
    card_cents: s.cardCents,
    credit_redeemed_cents: s.creditCents,
    vat9_cents: s.vat9Cents,
    vat23_cents: s.vat23Cents,
    refunded_cents: s.refundedCents,
    table_orders: s.tableOrders,
    collect_orders: s.collectOrders,
  });
  return {
    venue: venue.name,
    generated_at: new Date().toISOString(),
    money_note: "All amounts are euro cents, VAT included. App orders only; counter sales are on the venue's till.",
    today: { ...pick(today.now), sales_by_hour_cents: today.now.byHour, top_items: today.topItems },
    yesterday: pick(yesterday),
    last_7_days: { ...pick(week.now), previous_7_days: pick(week.before), by_day: week.byDay, top_items: week.topItems },
    last_30_days: { ...pick(month.now), previous_30_days: pick(month.before), by_day: month.byDay, top_items: month.topItems },
    loyalty_members: month.now.members,
    redemption_rules: rules,
    ai_assistant_requests: {
      total: activity.length,
      refused: activity.filter((a) => !a.allowed).length,
      by_tool: Object.fromEntries([...new Set(activity.map((a) => a.tool))].map((tool) => [tool, activity.filter((a) => a.tool === tool).length])),
    },
  };
}
