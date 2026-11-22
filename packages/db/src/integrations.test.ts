import { generateKeyPairSync, randomBytes } from "node:crypto";
import { myposSign } from "@round/core";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { pool, withTenant } from "./index";
import * as integ from "./integrations";
import * as t from "./schema";
import { seed } from "./seed";
import * as svc from "./services";
import { resetDatabase } from "./setup";

// Integration tests against a real Postgres (TEST_DATABASE_URL). They wipe that database.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://round:round@localhost:5432/round_test";

const KEY = randomBytes(32).toString("base64");
const merchant = generateKeyPairSync("rsa", { modulusLength: 2048 });
const mypos = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = (k: { export(o: object): string | Buffer }, type: "pkcs8" | "spki") => k.export({ type, format: "pem" }).toString();
const SID = "000000000000010";

let mj: svc.Venue;
let drum: svc.Venue;

beforeAll(async () => {
  await seed(await resetDatabase());
  mj = await svc.venueBySlug("mj-oconnors");
  drum = await svc.venueBySlug("drumhierny");
  await integ.saveIntegration(mj, "mypos", { sid: SID, walletNumber: "61938166610", keyIndex: 1, myposCertPem: pem(mypos.publicKey, "spki"), mode: "test" }, JSON.stringify({ privateKeyPem: pem(merchant.privateKey, "pkcs8") }), KEY);
  await integ.setPaymentProvider(mj, "mypos");
  mj = await svc.venueBySlug("mj-oconnors");
});
afterAll(() => pool().end());

async function itemId(venue: svc.Venue, name: string) {
  return (await svc.menu(venue)).flatMap((c) => c.items).find((i) => i.name === name)!.id;
}

function notify(fields: [string, string][]) {
  return new URLSearchParams([...fields, ["Signature", myposSign(fields.map(([, v]) => v), pem(mypos.privateKey, "pkcs8"))]]).toString();
}

async function placeMyPos(phone: string, key: string) {
  const c = await svc.createCustomer({ phone, name: "Aoife Murphy", email: "a@example.com", dateOfBirth: "1990-01-01", marketingConsent: false });
  const provider = await integ.providerForVenue(mj, KEY);
  const res = await svc.createOrder(
    { venue: mj, customer: c, channel: "collect", tableId: null, lines: [{ menuItemId: await itemId(mj, "Pint of stout"), qty: 2 }], creditRequestedCents: 0, useDouble: false, idempotencyKey: key, appUrl: "https://app.test" },
    provider,
  );
  return { c, provider, ...res };
}

describe("myPOS through the order flow", () => {
  it("keeps the venue's keys encrypted at rest", async () => {
    const [row] = await withTenant(mj.tenantId, (tx) => tx.select().from(t.venueIntegration).where(eq(t.venueIntegration.kind, "mypos")));
    expect(row.secretEnc).not.toContain("PRIVATE KEY");
    const status = await integ.integrationStatus(mj);
    expect(status.mypos?.hasSecret).toBe(true);
    expect(JSON.stringify(status)).not.toContain("PRIVATE KEY");
  });

  it("hands the guest a signed hosted-checkout form and pays on a signed notification", async () => {
    const { order, checkout, provider } = await placeMyPos("+353870001001", "mp1");
    expect(checkout!.redirect!.action).toBe("https://www.mypos.com/vmp/checkout-test");
    const f = Object.fromEntries(checkout!.redirect!.fields);
    expect(f.URL_Notify).toBe("https://app.test/api/webhooks/mypos/mj-oconnors");
    expect(f.OrderID).toBe(order.id);
    expect(f.Amount).toBe("12.40");

    const good = notify([["IPCmethod", "IPCPurchaseNotify"], ["SID", SID], ["Amount", "12.40"], ["Currency", "EUR"], ["OrderID", order.id], ["IPC_Trnref", "TRN1"]]);
    await expect(svc.handleWebhook(provider, good, new Headers(), drum)).rejects.toThrow(/another venue/);
    const r = await svc.handleWebhook(provider, good, new Headers(), mj);
    expect(r).toEqual({ status: 200, body: "OK" });
    const after = await svc.orderForCustomer(mj, order.id, order.customerId);
    expect(after.order.status).toBe("paid");
    expect(after.order.providerTxnRef).toBe("TRN1");
    expect(after.dockets).toHaveLength(1);
  });

  it("rejects a forged or under-paid notification", async () => {
    const { order, provider } = await placeMyPos("+353870001002", "mp2");
    const forged = new URLSearchParams([["OrderID", order.id], ["Amount", "12.40"], ["Signature", myposSign([order.id, "12.40"], pem(merchant.privateKey, "pkcs8"))]]).toString();
    expect((await svc.handleWebhook(provider, forged, new Headers(), mj)).status).toBe(401);
    const cheap = notify([["IPCmethod", "IPCPurchaseNotify"], ["SID", SID], ["Amount", "1.00"], ["Currency", "EUR"], ["OrderID", order.id]]);
    await expect(svc.handleWebhook(provider, cheap, new Headers(), mj)).rejects.toThrow(/Amount mismatch/);
    expect((await svc.orderForCustomer(mj, order.id, order.customerId)).order.status).toBe("pending_payment");
  });

  it("rebuilds the same checkout for a retried request", async () => {
    const a = await placeMyPos("+353870001003", "mp3");
    const b = await svc.createOrder(
      { venue: mj, customer: a.c, channel: "collect", tableId: null, lines: [], creditRequestedCents: 0, useDouble: false, idempotencyKey: "mp3", appUrl: "https://app.test" },
      a.provider,
    );
    expect(b.order.id).toBe(a.order.id);
    expect(Object.fromEntries(b.checkout!.redirect!.fields).Amount).toBe("12.40");
  });

  it("refunds through myPOS before marking the order refunded", async () => {
    const { order, provider } = await placeMyPos("+353870001004", "mp4");
    await svc.handleWebhook(provider, notify([["IPCmethod", "IPCPurchaseNotify"], ["SID", SID], ["Amount", "12.40"], ["Currency", "EUR"], ["OrderID", order.id], ["IPC_Trnref", "TRN4"]]), new Headers(), mj);
    const staff = (await svc.staffByEmail("staff@mjoconnors.example"))!;
    const d = (await svc.stationDockets(staff, "bar")).find((x) => x.orderId === order.id)!;
    const failing = { ...provider, refund: vi.fn(async () => { throw new Error("myPOS down"); }) };
    await expect(svc.refuseId(staff, d.id, failing)).rejects.toThrow(/myPOS down/);
    expect((await svc.orderForCustomer(mj, order.id, order.customerId)).order.status).toBe("paid");
    const ok = { ...provider, refund: vi.fn(async () => {}) };
    await svc.refuseId(staff, d.id, ok);
    expect(ok.refund).toHaveBeenCalledWith({ providerOrderId: order.id, txnRef: "TRN4", amountCents: 1240 }, "ID check refused");
    const after = (await svc.orderForCustomer(mj, order.id, order.customerId)).order;
    expect(after.status).toBe("refunded");
    expect(after.refundedAt).not.toBeNull();
  });

  it("cancels abandoned hosted checkouts", async () => {
    const { order } = await placeMyPos("+353870001005", "mp5");
    await withTenant(mj.tenantId, (tx) => tx.update(t.orders).set({ createdAt: new Date(Date.now() - 31 * 60_000) }).where(eq(t.orders.id, order.id)));
    await svc.reconcilePending((venueId) => integ.providerForVenue(venueId === mj.id ? mj : drum, KEY));
    expect((await svc.orderForCustomer(mj, order.id, order.customerId)).order.status).toBe("cancelled");
  });
});

describe("Google reviews", () => {
  it("records the click and sends the guest to Google", async () => {
    const { order } = await placeMyPos("+353870001006", "rv1");
    await expect(integ.reviewRedirect(mj, order.id, order.customerId)).rejects.toThrow(/aren't set up/);
    await expect(integ.setGooglePlaceId(mj, "not a place id!")).rejects.toThrow();
    await integ.setGooglePlaceId(mj, "ChIJN1t_tDeuEmsRUsoyG83frY4");
    mj = await svc.venueBySlug("mj-oconnors");
    expect(await integ.reviewRedirect(mj, order.id, order.customerId)).toBe("https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4");
    await expect(integ.reviewRedirect(mj, order.id, "00000000-0000-0000-0000-000000000000")).rejects.toThrow(/not found/);
  });
});

describe("Xero", () => {
  const app = { clientId: "cid", clientSecret: "csecret", redirectUri: "https://app.test/api/xero/callback" };

  it("connects, waits for account mapping, then posts each day exactly once", async () => {
    const posted: { url: string; body: unknown; key: string | null }[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/connect/token")) return Response.json({ access_token: "at", refresh_token: "rt2", expires_in: 1800 });
      if (url.endsWith("/connections")) return Response.json([{ tenantId: "ten-1", tenantName: "MJ O'Connor's Ltd" }]);
      posted.push({ url, body: JSON.parse(String(init!.body)), key: (init!.headers as Record<string, string>)["Idempotency-Key"] });
      return Response.json(url.endsWith("/Invoices") ? { Invoices: [{ InvoiceID: "inv-9" }] } : { Payments: [{}] });
    }) as unknown as typeof fetch;

    expect(await integ.connectXero(mj, app, "code123", KEY, fetchImpl)).toBe("MJ O'Connor's Ltd");
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: mj.timezone }).format(new Date());
    expect(await integ.syncXeroDay(mj, today, app, KEY, fetchImpl)).toBe("not_mapped");
    await integ.saveXeroMapping(mj, { ...integ.DEFAULT_XERO_MAPPING, taxType9: "OUTPUT9", taxType23: "OUTPUT23", paymentAccountCode: "090" });

    // Paid and refunded orders from the tests above fall on today's date.
    expect(await integ.syncXeroDay(mj, today, app, KEY, fetchImpl)).toBe("done");
    expect(await integ.syncXeroDay(mj, today, app, KEY, fetchImpl)).toBe("already");
    expect(posted.map((p) => p.url.split("/").pop())).toEqual(["Invoices", "Payments"]);
    const inv = (posted[0].body as { Invoices: { LineItems: { UnitAmount: number }[] }[] }).Invoices[0];
    const total = inv.LineItems.reduce((s, l) => s + Math.round(l.UnitAmount * 100), 0);
    const day = await integ.dayOrders(mj, today);
    expect(total).toBe(day.paid.reduce((s, o) => s + o.amountPaidCents, 0) - day.refunded.reduce((s, o) => s + o.amountPaidCents, 0));
    expect(posted[0].key).toBe(`snug:${mj.id}:${today}:inv`);
    expect(await integ.syncXeroDay(drum, today, app, KEY, fetchImpl)).toBe("not_connected");
  });
});
