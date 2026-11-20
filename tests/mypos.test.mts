// Run with: npm test
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { test } from "node:test";
import { buildPurchase, openToken, sealToken, signValues, toAmount, verifyCallback, type MyposConfig } from "../src/lib/mypos.ts";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const cfg: MyposConfig = {
  sid: "000000000000010",
  walletNumber: "61938166610",
  keyIndex: "1",
  privateKey: privateKey.export({ type: "pkcs1", format: "pem" }).toString(),
  publicCert: publicKey.export({ type: "spki", format: "pem" }).toString(),
  sandbox: true,
};

const purchase = buildPurchase(cfg, {
  orderId: "NWBM-TEST-1",
  currency: "EUR",
  items: [
    { article: "Full machine polish (28 ft)", quantity: 28, price: 4000 },
    { article: "Gelcoat Restoration Kit", quantity: 1, price: 7495 },
  ],
  customer: { email: "a@b.ie", phone: "", firstNames: "Test", familyName: "Customer", country: "IRL", city: "", zip: "", address: "" },
  urlOk: "https://x.ie/ok",
  urlCancel: "https://x.ie/cancel",
  urlNotify: "https://x.ie/notify",
});

test("amounts are formatted with two decimals", () => {
  assert.equal(toAmount(119495), "1194.95");
  assert.equal(toAmount(4000), "40.00");
  const get = (k: string) => purchase.fields.find(([n]) => n === k)?.[1];
  assert.equal(get("Amount"), "1194.95");
  assert.equal(get("Amount_1"), "1120.00");
  assert.equal(get("CartItems"), "2");
  assert.equal(purchase.url, "https://www.mypos.com/vmp/checkout-test");
});

test("fields follow the SDK order and end with the signature", () => {
  const names = purchase.fields.map(([n]) => n);
  assert.deepEqual(names.slice(0, 6), ["IPCmethod", "IPCVersion", "IPCLanguage", "SID", "WalletNumber", "KeyIndex"]);
  assert.equal(names.at(-1), "Signature");
});

test("a signed purchase verifies with the matching public key", () => {
  assert.ok(verifyCallback(cfg, purchase.fields));
});

test("callbacks verify and reject tampering", () => {
  const notify: [string, string][] = [
    ["IPCmethod", "IPCPurchaseNotify"], ["SID", cfg.sid], ["Amount", "1194.95"], ["Currency", "EUR"],
    ["OrderID", "NWBM-TEST-1"], ["IPC_Trnref", "123456"], ["RequestSTAN", "000001"], ["RequestDateTime", "2026-11-19 10:00:00"],
  ];
  const signed: [string, string][] = [...notify, ["Signature", signValues(notify.map(([, v]) => v), cfg.privateKey)]];
  const ok = verifyCallback(cfg, signed);
  assert.equal(ok?.orderid, "NWBM-TEST-1");
  const tampered = signed.map(([k, v]): [string, string] => [k, k === "Amount" ? "1.00" : v]);
  assert.equal(verifyCallback(cfg, tampered), null);
  assert.equal(verifyCallback(cfg, notify), null);
});

test("order tokens round-trip and reject edits", () => {
  const t = sealToken({ e: "a@b.ie", n: "Test" }, "secret");
  assert.deepEqual(openToken(t, "secret"), { e: "a@b.ie", n: "Test" });
  assert.equal(openToken(t.replace(/^./, "x"), "secret"), null);
  assert.equal(openToken(t, "other"), null);
});
