import { createHmac, createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { bankCredits, compareTakings, matchPayouts, mewsItems, MewsClient, myposDayTotals, revolutBusinessAssertion, trybeBooking, verifyTrybeSignature, verifyWooSignature, wooItems, wooPaid, type WooOrder } from "./connect";

describe("WooCommerce", () => {
  const body = '{"id":42}';
  it("verifies the base64 HMAC signature", () => {
    const sig = createHmac("sha256", "s3cret").update(body).digest("base64");
    expect(verifyWooSignature(body, "s3cret", sig)).toBe(true);
    expect(verifyWooSignature(body + " ", "s3cret", sig)).toBe(false);
    expect(verifyWooSignature(body, "s3cret", null)).toBe(false);
  });
  it("takes only paid orders and maps lines by SKU", () => {
    const o: WooOrder = { id: 42, status: "processing", currency: "EUR", total: "24.50", line_items: [{ sku: "PLU-7", name: "Sunday roast", quantity: 2, total: "24.50", total_tax: "2.02" }, { sku: "", name: "Gift voucher", quantity: 0, total: "0", total_tax: "0" }] };
    expect(wooPaid(o)).toBe(true);
    expect(wooPaid({ status: "pending" })).toBe(false);
    expect(wooItems(o)).toEqual([{ plu: "PLU-7", name: "Sunday roast", qty: 2 }]);
  });
});

describe("Trybe", () => {
  it("verifies the hex HMAC signature from the signature header", () => {
    const body = '{"event":"basket.settled"}';
    expect(verifyTrybeSignature(body, "trybe2025-secret", createHmac("sha256", "trybe2025-secret").update(body).digest("hex"))).toBe(true);
    expect(verifyTrybeSignature(body, "trybe2025-secret", "00")).toBe(false);
  });
  it("reads an order as a booking", () => {
    const b = trybeBooking({ id: "abc", order_ref: "TRY00", first_name: "Aoife", last_name: "Byrne", email: "Aoife@X.ie ", total_cost: 9500, booking_items_start_date: "2026-11-28T14:00:00Z", booking_items: [{ offering_name: "Hot tub (1 hour)" }, { offering_name: "Hot tub (1 hour)" }] });
    expect(b).toMatchObject({ externalId: "abc", ref: "TRY00", status: "confirmed", guestName: "Aoife Byrne", email: "aoife@x.ie", items: ["Hot tub (1 hour)"], totalCents: 9500 });
    expect(b.startsAt?.toISOString()).toBe("2026-11-28T14:00:00.000Z");
    expect(trybeBooking({ id: "abc" }, true).status).toBe("cancelled");
  });
});

describe("Mews", () => {
  it("builds gross-priced items with the tax code for each VAT rate", () => {
    const items = mewsItems([{ name: "Pint of stout", qty: 2, grossCents: 1240, vatRate: 23 }, { name: "Soup", qty: 1, grossCents: 750, vatRate: 9 }], { taxCodes: { "9": "IE-R", "23": "IE-S" }, accountingCategoryId: "cat1" });
    expect(items).toEqual([
      { Name: "Pint of stout", UnitCount: 2, UnitAmount: { Currency: "EUR", GrossValue: 6.2, TaxCodes: ["IE-S"] }, AccountingCategoryId: "cat1" },
      { Name: "Soup", UnitCount: 1, UnitAmount: { Currency: "EUR", GrossValue: 7.5, TaxCodes: ["IE-R"] }, AccountingCategoryId: "cat1" },
    ]);
  });
  it("finds the checked-in reservation for a room and posts to it", async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const f = (async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      calls.push({ url, body });
      const out = url.endsWith("resources/getAll") ? { Resources: [{ Id: "r1", Name: "101" }] } : url.includes("reservations/getAll/2023-06-06") ? { Reservations: [{ Id: "res1", AccountId: "acc1", State: "Started" }] } : { OrderId: "o1" };
      return new Response(JSON.stringify(out), { status: 200 });
    }) as typeof fetch;
    const m = new MewsClient({ platform: "demo", clientToken: "ct", accessToken: "at" }, f);
    const stay = await m.inHouse("101");
    expect(stay).toEqual({ reservationId: "res1", accountId: "acc1" });
    expect(await m.addOrder({ serviceId: "svc", accountId: "acc1", reservationId: "res1", items: [], notes: "Bar #12" })).toBe("o1");
    expect(calls[0].url).toBe("https://api.mews-demo.com/api/connector/v1/resources/getAll");
    expect(calls[1].body).toMatchObject({ AssignedResourceIds: ["r1"], States: ["Started"], ClientToken: "ct", AccessToken: "at" });
    expect(calls[2].body).toMatchObject({ ServiceId: "svc", AccountId: "acc1", LinkedReservationId: "res1" });
  });
});

describe("Revolut Business", () => {
  it("signs the client assertion with the venue's private key", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
    const jwt = revolutBusinessAssertion("cid", "complete.pub", privateKey, 1_800_000_000_000);
    const [h, b, s] = jwt.split(".");
    expect(JSON.parse(Buffer.from(b, "base64url").toString())).toEqual({ iss: "complete.pub", sub: "cid", aud: "https://revolut.com", exp: 1_800_000_300 });
    expect(createVerify("RSA-SHA256").update(`${h}.${b}`).verify(publicKey, Buffer.from(s, "base64url"))).toBe(true);
  });
  it("takes completed EUR credits only", () => {
    const c = bankCredits([
      { id: "t1", type: "topup", state: "completed", created_at: "2026-11-25T09:00:00Z", legs: [{ account_id: "a", amount: 512.3, currency: "EUR", description: "myPOS settlement" }] },
      { id: "t2", type: "card_payment", state: "completed", created_at: "2026-11-25T09:00:00Z", legs: [{ account_id: "a", amount: -40, currency: "EUR" }] },
      { id: "t3", type: "topup", state: "pending", created_at: "2026-11-25T09:00:00Z", legs: [{ account_id: "a", amount: 10, currency: "EUR" }] },
    ]);
    expect(c).toEqual([{ id: "t1:a", date: "2026-11-25", cents: 51230, description: "myPOS settlement" }]);
  });
});

describe("reconciliation", () => {
  it("matches payouts net of fees within the lag, once each", () => {
    const r = matchPayouts(
      [{ date: "2026-11-20", expectedCents: 50000 }, { date: "2026-11-21", expectedCents: 30000 }, { date: "2026-11-22", expectedCents: 0 }, { date: "2026-11-25", expectedCents: 10000 }],
      [{ id: "p1", date: "2026-11-22", cents: 49100, description: "" }, { id: "p2", date: "2026-11-27", cents: 29500, description: "" }],
      "2026-11-27",
    );
    expect(r.map((x) => [x.date, x.status, x.credit?.id ?? null])).toEqual([
      ["2026-11-20", "matched", "p1"],
      ["2026-11-21", "missing", null], // p2 landed 6 days later: too late to be this day's payout
      ["2026-11-22", "nothing", null],
      ["2026-11-25", "waiting", null],
    ]);
  });
  it("totals myPOS rows by local day, refunds negative", () => {
    const d = myposDayTotals([
      { amount: "12.50", currency: "EUR", date: "2026-07-25T23:30:00Z", transaction_type: "Purchase" },
      { amount: 4, currency: "EUR", date: "2026-11-25T10:00:00Z", transaction_type: "Refund" },
      { amount: 99, currency: "EUR", date: "2026-11-25T10:00:00Z", transaction_type: "Payout" },
    ]);
    expect([...d.entries()]).toEqual([["2026-07-26", 1250], ["2026-11-25", -400]]);
    expect(compareTakings(1000, 1050)).toEqual({ ok: true, diffCents: 50 });
    expect(compareTakings(1000, 1250).ok).toBe(false);
  });
});
