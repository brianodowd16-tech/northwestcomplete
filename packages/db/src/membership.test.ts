import { MockProvider } from "@round/core";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool, systemDb } from "./index";
import * as m from "./membership";
import * as t from "./schema";
import { seed } from "./seed";
import * as svc from "./services";
import { resetDatabase } from "./setup";
import * as sp from "./sponsors";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://round:round@localhost:5432/round_test";
const complete = new MockProvider();
const venuePay = new MockProvider();
let mj: svc.Venue, drum: svc.Venue, g: svc.Customer;

beforeAll(async () => {
  await seed(await resetDatabase());
  mj = await svc.venueBySlug("mj-oconnors");
  drum = await svc.venueBySlug("drumhierny");
  g = await svc.createCustomer({ phone: "+353871116001", name: "Sinéad Gallagher", email: "sinead@x.ie", dateOfBirth: "1988-08-08", marketingConsent: false });
});
afterAll(() => pool().end());

const payComplete = async (paymentId: string) => {
  const [p] = await systemDb().select().from(t.completePayment).where(eq(t.completePayment.id, paymentId));
  const { rawBody, headers } = complete.simulatePayment(p.providerOrderId!);
  return m.handleCompleteWebhook(complete, rawBody, headers);
};
const bal = async () => (await m.walletSummary(g.id)).balances;
const item = async (v: svc.Venue, alcohol: boolean) => (await svc.menu(v)).flatMap((x) => x.items).find((i) => i.containsAlcohol === alcohol && !i.soldOut)!;

describe("Gold and Platinum", () => {
  it("joins Gold once paid, with the month's bonus points", async () => {
    const r = await m.buyTier(g, "gold", "monthly", "k-tier-1", complete, "https://app.test");
    expect(r.payment.amountCents).toBe(499);
    expect(await m.currentTier(g.id)).toBeNull();
    await payComplete(r.payment.id);
    await payComplete(r.payment.id); // a repeated notification changes nothing
    expect((await m.currentTier(g.id))?.tier).toBe("gold");
    expect(await bal()).toEqual({ paid: 0, bonus: 300 });
    expect(await m.grantMonthlyBonuses()).toBeGreaterThan(0);
    expect(await bal()).toEqual({ paid: 0, bonus: 300 }); // still once this month
  });

  it("buys points with the tier's bonus, within limits", async () => {
    const r = await m.buyPoints(g, 5000, "k-pts-1", complete, "https://app.test");
    await payComplete(r.payment.id);
    expect(await bal()).toEqual({ paid: 5000, bonus: 550 });
    await expect(m.buyPoints(g, 1234, "k-pts-2", complete, "https://app.test")).rejects.toThrow(/€10, €25/);
  });

  it("upgrades to Platinum straight away", async () => {
    const r = await m.buyTier(g, "platinum", "annual", "k-tier-2", complete, "https://app.test");
    await payComplete(r.payment.id);
    expect((await m.currentTier(g.id))?.tier).toBe("platinum");
    expect((await bal()).bonus).toBe(1550);
    await expect(m.buyTier(g, "gold", "monthly", "k-tier-3", complete, "https://app.test")).rejects.toThrow(/already Platinum/);
  });
});

describe("spending points at any venue", () => {
  it("bonus points pay for food, never pints; bought points pay for pints", async () => {
    const food = await item(mj, false), pint = await item(mj, true);
    const { order } = await svc.createOrder({ venue: mj, customer: g, channel: "collect", tableId: null, lines: [{ menuItemId: pint.id, qty: 2 }], creditRequestedCents: 0, useDouble: false, idempotencyKey: "k-w-1", appUrl: "https://app.test", useWallet: true }, venuePay);
    expect(order).toMatchObject({ walletBonusCents: 0, walletPaidCents: pint.priceCents * 2, amountPaidCents: 0, status: "paid" });
    const before = await bal();
    const drumFood = await item(drum, false);
    const r2 = await svc.createOrder({ venue: drum, customer: g, channel: "collect", tableId: null, lines: [{ menuItemId: drumFood.id, qty: 1 }], creditRequestedCents: 0, useDouble: false, idempotencyKey: "k-w-2", appUrl: "https://app.test", useWallet: true }, venuePay);
    expect(r2.order.walletBonusCents).toBe(Math.min(before.bonus, drumFood.priceCents));
    expect(r2.order.rewardableCents).toBe(Math.max(0, drumFood.priceCents - r2.order.walletBonusCents - r2.order.walletPaidCents));
    expect(food).toBeTruthy();
  });

  it("an abandoned card payment gives the points back", async () => {
    const food = await item(mj, false);
    const startBal = await bal();
    const { order } = await svc.createOrder({ venue: mj, customer: g, channel: "collect", tableId: null, lines: [{ menuItemId: food.id, qty: 9 }, { menuItemId: (await item(mj, true)).id, qty: 9 }], creditRequestedCents: 0, useDouble: false, idempotencyKey: "k-w-3", appUrl: "https://app.test", useWallet: true }, venuePay);
    expect(order.status).toBe("pending_payment");
    expect((await bal()).paid + (await bal()).bonus).toBeLessThan(startBal.paid + startBal.bonus);
    await systemDb().update(t.orders).set({ createdAt: new Date(Date.now() - 3_600_000), providerOrderId: null }).where(eq(t.orders.id, order.id));
    await svc.reconcilePending(async () => venuePay);
    expect(await bal()).toEqual(startBal);
  });

  it("Complete owes each venue what was spent there", async () => {
    const from = new Date(Date.now() - 86_400_000), to = new Date(Date.now() + 86_400_000);
    const pint = await item(mj, true);
    expect(await m.walletSettlement(mj.id, from, to)).toBe(pint.priceCents * 2);
    expect(await m.walletSettlement(drum.id, from, to)).toBeGreaterThan(0);
  });
});

describe("wedding sponsorship", () => {
  it("shows Drumhierny in its placements and passes enquiries on only with consent", async () => {
    expect((await sp.sponsorsFor("landing")).map((s) => s.slug)).toEqual(["drumhierny-weddings"]);
    const s = await sp.sponsorBySlug("drumhierny-weddings");
    await sp.countSponsor(s.id, "landing", "impressions");
    await sp.countSponsor(s.id, "landing", "impressions");
    await sp.countSponsor(s.id, "landing", "clicks");
    await expect(sp.submitLead(s.slug, { name: "Aoife and Cian", email: "a@x.ie", consent: false }, null)).rejects.toThrow(/Tick the box/);
    await sp.submitLead(s.slug, { name: "Aoife and Cian", email: "A@X.ie", eventDate: "2027-09-18", guests: 120, message: "Autumn wedding", consent: true }, g.id);
    const leads = await sp.sponsorLeads(drum);
    expect(leads).toMatchObject([{ name: "Aoife and Cian", email: "a@x.ie", guests: 120, status: "new" }]);
    expect(await sp.sponsorLeads(mj)).toEqual([]);
    const rep = await sp.sponsorReport(s.id);
    expect(rep.find((r) => r.placement === "landing")).toMatchObject({ impressions: 2, clicks: 1 });
    expect(rep.find((r) => r.placement === "page")).toMatchObject({ leads: 1 });
    const mails = await systemDb().select().from(t.emailOutbox);
    expect(mails.some((x) => x.subject.startsWith("New enquiry: Aoife and Cian"))).toBe(true);
  });
});
