import { generateKeyPairSync, randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  buildDaySummary,
  buildPurchaseFields,
  decryptSecret,
  encryptSecret,
  googleReviewUrl,
  localDate,
  myposSign,
  myposVerify,
  MyPosProvider,
  parseConfigPack,
  splitName,
  XeroClient,
  type CreateOrderInput,
  type MyPosConfig,
  type XeroMapping,
} from "./index";

const merchant = generateKeyPairSync("rsa", { modulusLength: 2048 });
const mypos = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = (k: { export(o: object): string | Buffer }, type: "pkcs8" | "spki") => k.export({ type, format: "pem" }).toString();

const cfg: MyPosConfig = {
  sid: "000000000000010",
  walletNumber: "61938166610",
  keyIndex: 1,
  privateKeyPem: pem(merchant.privateKey, "pkcs8"),
  myposCertPem: pem(mypos.publicKey, "spki"),
  mode: "test",
};

const order: CreateOrderInput = {
  amountCents: 1940,
  currency: "EUR",
  reference: "3f1c-order",
  description: "MJ O'Connor's order #12",
  lineItems: [
    { name: "Pint of stout", quantity: 2, unitPriceCents: 620, totalCents: 1240 },
    { name: "Fish & chips", quantity: 1, unitPriceCents: 1700, totalCents: 1700 },
  ],
  discountCents: 1000,
  customer: { email: "a@example.com", firstName: "Aoife", lastName: "Murphy" },
  urls: { ok: "https://app.example/ok", cancel: "https://app.example/cancel", notify: "https://app.example/notify" },
};

/** What myPOS would send to URL_Notify, signed with myPOS's key. */
function notifyBody(fields: [string, string][]) {
  const sig = myposSign(fields.map(([, v]) => v), pem(mypos.privateKey, "pkcs8"));
  return new URLSearchParams([...fields, ["Signature", sig]]).toString();
}

describe("myPOS", () => {
  it("signs the purchase form so the matching public key verifies it", async () => {
    const created = await new MyPosProvider(cfg).createOrder(order);
    expect(created.redirect!.action).toBe("https://www.mypos.com/vmp/checkout-test");
    const fields = created.redirect!.fields;
    expect(fields.at(-1)![0]).toBe("Signature");
    const f = Object.fromEntries(fields);
    expect(f.Amount).toBe("19.40");
    expect(f.OrderID).toBe("3f1c-order");
    // cart adds up to Amount, with loyalty credit as a negative line
    expect(f.CartItems).toBe("3");
    expect(f.Price_3).toBe("-10.00");
    const cartTotal = [1, 2, 3].reduce((s, n) => s + Math.round(Number(f[`Amount_${n}`]) * 100), 0);
    expect(cartTotal).toBe(1940);
    const values = fields.slice(0, -1).map(([, v]) => v);
    expect(myposVerify(values, f.Signature, pem(merchant.publicKey, "spki"))).toBe(true);
    expect(myposVerify([...values.slice(0, -1), "tampered"], f.Signature, pem(merchant.publicKey, "spki"))).toBe(false);
  });

  it("verifies a genuine notification and rejects forged or altered ones", () => {
    const p = new MyPosProvider(cfg);
    const body = notifyBody([
      ["IPCmethod", "IPCPurchaseNotify"],
      ["SID", cfg.sid],
      ["Amount", "19.40"],
      ["Currency", "EUR"],
      ["OrderID", "3f1c-order"],
      ["IPC_Trnref", "12345678"],
      ["RequestSTAN", "000123"],
    ]);
    expect(p.verifyWebhook(body)).toBe(true);
    expect(p.parseWebhook(body)).toEqual({ event: "ORDER_COMPLETED", providerOrderId: "3f1c-order", state: "completed", amountCents: 1940, txnRef: "12345678" });
    expect(p.verifyWebhook(body.replace("19.40", "1.00"))).toBe(false);
    expect(p.verifyWebhook(body.replace(/&Signature=[^&]+/, ""))).toBe(false);
    const forged = new URLSearchParams([["OrderID", "x"], ["Signature", myposSign(["x"], cfg.privateKeyPem)]]).toString();
    expect(p.verifyWebhook(forged)).toBe(false);
  });

  it("rejects notifications for another store", () => {
    const body = notifyBody([["IPCmethod", "IPCPurchaseNotify"], ["SID", "999"], ["OrderID", "o"]]);
    expect(() => new MyPosProvider(cfg).parseWebhook(body)).toThrow(/another store/);
  });

  it("sends a signed refund and checks the result", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ Status: 0 })));
    await new MyPosProvider(cfg, fetchImpl as unknown as typeof fetch).refund({ providerOrderId: "o1", txnRef: "T1", amountCents: 950 }, "ID refused");
    const sent = new URLSearchParams(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(sent.get("IPCmethod")).toBe("IPCRefund");
    expect(sent.get("Amount")).toBe("9.50");
    const failing = vi.fn(async () => new Response(JSON.stringify({ Status: 5 })));
    await expect(new MyPosProvider(cfg, failing as unknown as typeof fetch).refund({ providerOrderId: "o1", txnRef: "T1", amountCents: 950 }, "x")).rejects.toThrow(/failed/);
    await expect(new MyPosProvider(cfg).refund({ providerOrderId: "o1", txnRef: null, amountCents: 950 }, "x")).rejects.toThrow(/reference/);
  });

  it("splits names for the checkout", () => {
    expect(splitName("Aoife Ní Bhriain")).toEqual({ firstName: "Aoife", lastName: "Ní Bhriain" });
    expect(splitName("Cher")).toEqual({ firstName: "Cher", lastName: "Cher" });
  });

  it("builds forms deterministically", () => {
    expect(buildPurchaseFields(cfg, order)).toEqual(buildPurchaseFields(cfg, order));
  });
});

describe("secrets", () => {
  const key = randomBytes(32).toString("base64");
  it("round-trips and detects tampering or the wrong key", () => {
    const enc = encryptSecret("-----BEGIN PRIVATE KEY-----abc", key);
    expect(enc).not.toContain("abc");
    expect(decryptSecret(enc, key)).toBe("-----BEGIN PRIVATE KEY-----abc");
    expect(() => decryptSecret(enc.slice(0, -2) + "AA", key)).toThrow();
    expect(() => decryptSecret(enc, randomBytes(32).toString("base64"))).toThrow();
    expect(() => encryptSecret("x", "short")).toThrow(/32 bytes/);
  });
});

describe("Google reviews", () => {
  it("links to Google's own review form and rejects junk", () => {
    expect(googleReviewUrl("ChIJN1t_tDeuEmsRUsoyG83frY4")).toBe("https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4");
    expect(() => googleReviewUrl("javascript:alert(1)")).toThrow();
  });
});

const mapping: XeroMapping = {
  contactName: "The Snug Club app sales",
  salesAccountCode: "200",
  taxType9: "OUTPUT9",
  taxType23: "OUTPUT23",
  creditAccountCode: "210",
  creditTaxType: "NONE",
  paymentAccountCode: "090",
};

describe("Xero day summary", () => {
  const o1 = { lines: [{ grossCents: 1240, vatRate: 23 as const }, { grossCents: 1700, vatRate: 9 as const }], creditUsedCents: 1000, amountPaidCents: 1940 };
  const o2 = { lines: [{ grossCents: 950, vatRate: 23 as const }], creditUsedCents: 0, amountPaidCents: 950 };

  it("summarises sales by VAT rate, less credit, and pays the card amount", () => {
    const s = buildDaySummary({ date: "2026-11-18", venueName: "MJ O'Connor's", paid: [o1, o2], refunded: [] }, mapping)!;
    expect(s.invoice.LineItems.map((l) => [l.UnitAmount, l.TaxType])).toEqual([
      [17, "OUTPUT9"],
      [21.9, "OUTPUT23"],
      [-10, "NONE"],
    ]);
    expect(s.totalCents).toBe(2890);
    expect(s.paymentCents).toBe(2890);
    expect(s.invoice.LineAmountTypes).toBe("Inclusive");
  });

  it("nets refunds and returns credit", () => {
    const s = buildDaySummary({ date: "2026-11-18", venueName: "V", paid: [o1, o2], refunded: [o1] }, mapping)!;
    expect(s.totalCents).toBe(950);
    expect(s.paymentCents).toBe(950);
  });

  it("returns nothing for a quiet day and refuses a negative day", () => {
    expect(buildDaySummary({ date: "2026-11-18", venueName: "V", paid: [], refunded: [] }, mapping)).toBeNull();
    expect(() => buildDaySummary({ date: "2026-11-18", venueName: "V", paid: [], refunded: [o2] }, mapping)).toThrow(/credit note/);
  });

  it("posts invoice then payment with idempotency keys", async () => {
    const calls: [string, RequestInit][] = [];
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      calls.push([url, init]);
      return new Response(JSON.stringify(url.endsWith("/Invoices") ? { Invoices: [{ InvoiceID: "inv-1" }] } : { Payments: [{}] }));
    });
    const s = buildDaySummary({ date: "2026-11-18", venueName: "V", paid: [o2], refunded: [] }, mapping)!;
    const id = await new XeroClient({ clientId: "c", clientSecret: "s", redirectUri: "r" }, fetchImpl as unknown as typeof fetch).postDay(
      { accessToken: "at", refreshToken: "rt", expiresAt: 0 },
      "tenant-1",
      s,
      "090",
      "venue:2026-11-18",
    );
    expect(id).toBe("inv-1");
    expect(calls.map(([u, i]) => [u.split("/").pop(), (i.headers as Record<string, string>)["Idempotency-Key"]])).toEqual([
      ["Invoices", "venue:2026-11-18:inv"],
      ["Payments", "venue:2026-11-18:pay"],
    ]);
    expect((calls[0][1].headers as Record<string, string>)["xero-tenant-id"]).toBe("tenant-1");
  });

  it("uses the venue's local date", () => {
    expect(localDate(new Date("2026-06-30T23:30:00Z"), "Europe/Dublin")).toBe("2026-07-01");
  });
});

describe("myPOS configuration pack", () => {
  const pack = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64");
  it("reads sid, wallet, keys and index", () => {
    const p = pack({ sid: "000000000000010", cn: "61938166610", pk: cfg.privateKeyPem, pc: cfg.myposCertPem, idx: 1 });
    expect(parseConfigPack(p, "test")).toEqual({ ...cfg, privateKeyPem: cfg.privateKeyPem.trim(), myposCertPem: cfg.myposCertPem.trim(), mode: "test" });
    expect(parseConfigPack(p.match(/.{1,60}/g)!.join("\n"), "live").mode).toBe("live");
  });
  it("rejects junk and incomplete packs", () => {
    expect(() => parseConfigPack("not a pack!", "test")).toThrow(/isn't a myPOS/);
    expect(() => parseConfigPack(pack({ sid: "1", cn: "2", idx: 1 }), "test")).toThrow(/missing its keys/);
    expect(() => parseConfigPack(pack({ cn: "2", pk: cfg.privateKeyPem, pc: cfg.myposCertPem, idx: 1 }), "test")).toThrow(/store ID/);
    expect(() => parseConfigPack(pack({ sid: "1", cn: "2", pk: "-----BEGIN PRIVATE KEY-----\nnope\n-----END PRIVATE KEY-----", pc: cfg.myposCertPem, idx: 1 }), "test")).toThrow();
  });
});
