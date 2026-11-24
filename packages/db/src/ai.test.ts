import { MockProvider } from "@round/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as ai from "./ai";
import { pool } from "./index";
import { seed } from "./seed";
import * as svc from "./services";
import { resetDatabase } from "./setup";

// Integration tests against a real Postgres (TEST_DATABASE_URL). They wipe that database.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://round:round@localhost:5432/round_test";

const provider = new MockProvider();
const APP = "https://app.test";
let mj: svc.Venue;
let guest: svc.Customer;
let ids: Record<string, string>;

beforeAll(async () => {
  await seed(await resetDatabase());
  mj = await svc.venueBySlug("mj-oconnors");
  guest = await svc.createCustomer({ phone: "+353870002001", name: "Aoife Murphy", email: "a@example.com", dateOfBirth: "1990-01-01", marketingConsent: false });
  ids = Object.fromEntries((await svc.menu(mj)).flatMap((c) => c.items).map((i) => [i.name, i.id]));
});
afterAll(() => pool().end());

async function paidOrder(customer: svc.Customer, names: string[], key: string) {
  const [table] = await svc.venueTables(mj);
  const { order } = await svc.createOrder(
    { venue: mj, customer, channel: "table", tableId: table.id, lines: names.map((n) => ({ menuItemId: ids[n], qty: 1 })), creditRequestedCents: 0, useDouble: false, idempotencyKey: key, appUrl: APP },
    provider,
  );
  const { rawBody, headers } = provider.simulatePayment(order.providerOrderId!);
  await svc.handleWebhook(provider, rawBody, headers, mj);
  return order;
}

describe("redemption rules at checkout", () => {
  it("applies the minimum order for credit and the monthly budget on the server", async () => {
    await ai.saveRedemptionRules(mj, { creditMinOrderCents: 1000, allowCreditWithDouble: true, monthlyCreditBudgetCents: 300, doubleMinOrderCents: 0 });
    const small = await svc.createOrder(
      { venue: mj, customer: guest, channel: "collect", tableId: null, lines: [{ menuItemId: ids["Soft drink"], qty: 1 }], creditRequestedCents: 99_999, useDouble: false, idempotencyKey: "r1", appUrl: APP },
      provider,
    );
    expect(small.order.creditUsedCents).toBe(0);
    const big = await svc.createOrder(
      { venue: mj, customer: guest, channel: "collect", tableId: null, lines: [{ menuItemId: ids["Gin & tonic"], qty: 2 }], creditRequestedCents: 99_999, useDouble: false, idempotencyKey: "r2", appUrl: APP },
      provider,
    );
    expect(big.order.creditUsedCents).toBe(300); // capped by the venue's budget
    await ai.saveRedemptionRules(mj, { creditMinOrderCents: 0, allowCreditWithDouble: true, monthlyCreditBudgetCents: null, doubleMinOrderCents: 0 });
  });
});

describe("recommendations", () => {
  it("learns the guest's usual and what goes together", async () => {
    const other = await svc.createCustomer({ phone: "+353870002002", name: "Seán Byrne", email: "s@example.com", dateOfBirth: "1985-01-01", marketingConsent: false });
    await paidOrder(guest, ["Pint of stout"], "h1");
    await paidOrder(guest, ["Pint of stout"], "h2");
    await paidOrder(other, ["Fish & chips", "Pint of lager"], "p1");
    await paidOrder(other, ["Fish & chips", "Pint of lager"], "p2");
    const recs = await ai.recommendationsFor(mj, guest.id, [ids["Fish & chips"]]);
    expect(recs.slice(0, 2).map((r) => [r.item.name, r.reason])).toEqual([
      ["Pint of stout", "your_usual"],
      ["Pint of lager", "goes_with"],
    ]);
  });
});

describe("AI assistant access", () => {
  let token: string;

  it("needs a valid token and never stores it", async () => {
    token = await ai.createGrant(mj, guest.id, { name: "Claude", scopes: ["profile:read", "benefits:read", "orders:quote", "orders:create"], maxOrderCents: 3000, maxCreditCents: 500, days: 30 });
    expect(token).toMatch(/^cpl_/);
    const [g] = await ai.listGrants(mj, guest.id);
    expect(g.tokenHash).not.toContain(token);
    await expect(ai.authenticateAgent("cpl_nope")).rejects.toThrow(ai.AgentAuthError);
    await expect(ai.authenticateAgent(null)).rejects.toThrow(ai.AgentAuthError);
  });

  it("shares the profile and benefits as data", async () => {
    const ctx = await ai.authenticateAgent(token);
    const p = await ai.runAgentTool(ctx, "get_profile", {}, APP);
    expect(p.ok).toBe(true);
    expect(p.data).toMatchObject({ first_name: "Aoife", level: "Regular", limits: { max_order_cents: 3000 } });
    const b = await ai.runAgentTool(ctx, "list_benefits", { basket_total_cents: 2000 }, APP);
    expect((b.data as { benefits: { id: string }[] }).benefits.map((x) => x.id)).toContain("credit");
  });

  it("refuses what the guest didn't allow, and anything over the limits", async () => {
    const ctx = await ai.authenticateAgent(token);
    const conv = await ai.runAgentTool(ctx, "convert_points", { points: 100 }, APP);
    expect(conv).toMatchObject({ ok: false, error: "You haven't allowed this assistant to do that" });
    const big = await ai.runAgentTool(ctx, "quote_order", { lines: [{ item_id: ids["Gin & tonic"], qty: 4 }] }, APP);
    expect(big.ok).toBe(false);
    expect(big.error).toMatch(/order limit/);
  });

  it("quotes within limits and prepares an order that waits for the guest", async () => {
    const ctx = await ai.authenticateAgent(token);
    const q = await ai.runAgentTool(ctx, "quote_order", { lines: [{ item_id: ids["Pint of stout"], qty: 2 }] }, APP);
    expect(q.data).toMatchObject({ total_cents: 1240, credit_cents: 500, to_pay_cents: 740 }); // credit capped at the assistant's €5 limit
    const s = await ai.runAgentTool(ctx, "start_order", { lines: [{ item_id: ids["Pint of stout"], qty: 2 }] }, APP);
    expect(s.data).toMatchObject({ status: "waiting_for_guest_approval" });
    const url = (s.data as { approve_url: string }).approve_url;
    const orderId = url.split("/").pop()!;
    const held = await svc.orderForCustomer(mj, orderId, guest.id);
    expect(held.order.status).toBe("pending_payment");
    expect(held.order.providerOrderId).toBeNull();
    expect(held.dockets).toHaveLength(0);

    // Approving late still gives the guest the full payment window.
    await pool().query("update orders set created_at = now() - interval '29 minutes' where id = $1", [orderId]);
    // The guest approves in the app: checkout starts with the venue's own provider.
    const approved = await svc.approveHeldOrder(mj, guest, orderId, provider, APP);
    expect(approved.checkout?.token).toBeTruthy();
    await svc.reconcilePending(async () => ({ ...provider, getOrder: null }) as never, 0);
    expect((await svc.orderForCustomer(mj, orderId, guest.id)).order.status).toBe("pending_payment");
    await expect(svc.approveHeldOrder(mj, guest, orderId, provider, APP)).rejects.toThrow(/already being paid/);
    const { rawBody, headers } = provider.simulatePayment(approved.order.providerOrderId!);
    await svc.handleWebhook(provider, rawBody, headers, mj);
    expect((await svc.orderForCustomer(mj, orderId, guest.id)).dockets).toHaveLength(1);
  });

  it("records every request, allowed or not, and stops working once revoked", async () => {
    const log = await ai.agentActivity(mj, { customerId: guest.id });
    expect(log.length).toBeGreaterThanOrEqual(6);
    expect(log.some((l) => !l.allowed && l.tool === "convert_points")).toBe(true);
    const [g] = await ai.listGrants(mj, guest.id);
    await ai.revokeGrant(mj, guest.id, g.id);
    await expect(ai.authenticateAgent(token)).rejects.toThrow(/switched off/);
  });
});
