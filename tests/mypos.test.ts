import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { MYPOS_SANDBOX } from "@/lib/mypos-sandbox";
import { buildPurchase, fromMyPosOrderId, parseFields, sign, toMyPosOrderId, verify } from "@/lib/mypos";

const cfg = { mode: "sandbox" as const, ...MYPOS_SANDBOX };
const input = {
  orderId: "ODW42TABC",
  currency: "EUR",
  totalCents: 130000,
  items: [{ name: "Gazco Studio 1", quantity: 1, unitCents: 125000 }, { name: "Ash caddy", quantity: 2, unitCents: 2500 }],
  customer: { email: "a@b.ie", phone: "0871234567", firstName: "Áine", lastName: "O'Dowd", country: "IRL", city: "Carrick", zip: "N41", address: "Main St" },
  urls: { ok: "https://shop.example/ok", cancel: "https://shop.example/cancel", notify: "https://shop.example/notify" },
};

describe("buildPurchase", () => {
  it("produces fields in SDK order with Signature last", () => {
    const { url, fields } = buildPurchase(cfg, input);
    expect(url).toBe("https://www.mypos.com/vmp/checkout-test");
    const keys = fields.map(([k]) => k);
    expect(keys.slice(0, 10)).toEqual(["IPCmethod", "IPCVersion", "IPCLanguage", "SID", "WalletNumber", "KeyIndex", "Source", "Currency", "Amount", "OrderID"]);
    expect(keys.at(-1)).toBe("Signature");
    const get = (k: string) => fields.find(([n]) => n === k)?.[1];
    expect(get("Amount")).toBe("1300.00");
    expect(get("CartItems")).toBe("2");
    expect(get("Amount_2")).toBe("50.00");
    expect(get("customerfamilyname")).toBe("O Dowd");
  });

  it("signs with RSA-SHA256 over base64 of '-'-joined values", () => {
    const { fields } = buildPurchase(cfg, input);
    const values = fields.filter(([k]) => k !== "Signature").map(([, v]) => v);
    const pub = crypto.createPublicKey(cfg.privateKey);
    const ok = crypto
      .createVerify("RSA-SHA256")
      .update(Buffer.from(values.join("-")).toString("base64"))
      .verify(pub, Buffer.from(fields.at(-1)![1], "base64"));
    expect(ok).toBe(true);
  });

  it("adds a balancing line so item amounts always equal the total", () => {
    const { fields } = buildPurchase(cfg, { ...input, totalCents: 130001 });
    const get = (k: string) => fields.find(([n]) => n === k)?.[1];
    expect(get("CartItems")).toBe("3");
    expect(get("Amount_3")).toBe("0.01");
  });
});

describe("verify", () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 1024 });
  const pubPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const privPem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();
  const body: [string, string][] = [["IPCmethod", "IPCPurchaseNotify"], ["SID", "10"], ["Amount", "10.00"], ["Currency", "EUR"], ["OrderID", "ODW1T1"]];

  it("accepts a valid signature and rejects tampering", () => {
    const signed: [string, string][] = [...body, ["Signature", sign(body, privPem)]];
    expect(verify(signed, pubPem)).toBe(true);
    const tampered = signed.map(([k, v]) => [k, k === "Amount" ? "1.00" : v] as [string, string]);
    expect(verify(tampered, pubPem)).toBe(false);
    expect(verify(body, pubPem)).toBe(false);
  });

  it("keeps field order when parsing a urlencoded body", () => {
    const signed: [string, string][] = [...body, ["Signature", sign(body, privPem)]];
    const raw = new URLSearchParams(signed).toString();
    expect(verify(parseFields(raw), pubPem)).toBe(true);
  });
});

describe("order ids", () => {
  it("round-trips WooCommerce ids", () => {
    expect(fromMyPosOrderId(toMyPosOrderId(1234, 1700000000000))).toBe(1234);
    expect(fromMyPosOrderId("1234")).toBeNull();
    expect(fromMyPosOrderId("ODW12")).toBeNull();
  });
});
