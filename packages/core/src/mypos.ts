import { createSign, createVerify } from "node:crypto";
import type { CreateOrderInput, CreatedOrder, PaymentProvider, WebhookEvent } from "./payments";

// myPOS Checkout API (IPC v1.4). The guest's browser POSTs a signed form to the
// hosted checkout; myPOS then POSTs a signed IPCPurchaseNotify to URL_Notify,
// which must answer 200 "OK". Only Notify authorises a payment, never URL_OK.
//
// Signature: join the field VALUES (in send order, Signature excluded) with "-",
// base64 the result, RSA-SHA256 sign it, base64 the signature.

export const MYPOS_ENDPOINTS = {
  test: "https://www.mypos.com/vmp/checkout-test",
  live: "https://www.mypos.com/vmp/checkout",
} as const;

export interface MyPosConfig {
  sid: string;
  walletNumber: string;
  keyIndex: number;
  /** merchant RSA 2048 private key, PEM */
  privateKeyPem: string;
  /** myPOS public certificate for this store, PEM (from the merchant portal) */
  myposCertPem: string;
  mode: "test" | "live";
}

function signedText(values: string[]) {
  return Buffer.from(values.join("-"), "utf8").toString("base64");
}

export function myposSign(values: string[], privateKeyPem: string): string {
  return createSign("RSA-SHA256").update(signedText(values)).sign(privateKeyPem, "base64");
}

export function myposVerify(values: string[], signatureB64: string, certPem: string): boolean {
  try {
    return createVerify("RSA-SHA256").update(signedText(values)).verify(certPem, Buffer.from(signatureB64, "base64"));
  } catch {
    return false;
  }
}

/** Cents → "12.30". myPOS signs the exact text sent, so amounts are always strings. */
export const myposAmount = (cents: number) => (cents / 100).toFixed(2);

const parseAmount = (s: string | undefined) => (s && /^-?\d+(\.\d{1,2})?$/.test(s) ? Math.round(Number(s) * 100) : undefined);

/** Splits a full name into myPOS's first/family name fields. */
export function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/);
  return { firstName: parts[0] || "Guest", lastName: parts.slice(1).join(" ") || parts[0] || "Guest" };
}

export function buildPurchaseFields(cfg: MyPosConfig, input: CreateOrderInput): [string, string][] {
  const fields: [string, string][] = [
    ["IPCmethod", "IPCPurchase"],
    ["IPCVersion", "1.4"],
    ["IPCLanguage", "EN"],
    ["SID", cfg.sid],
    ["WalletNumber", cfg.walletNumber],
    ["Amount", myposAmount(input.amountCents)],
    ["Currency", input.currency],
    ["OrderID", input.reference],
    ["URL_OK", input.urls.ok],
    ["URL_Cancel", input.urls.cancel],
    ["URL_Notify", input.urls.notify],
    ["CardTokenRequest", "0"],
    ["KeyIndex", String(cfg.keyIndex)],
    ["PaymentParametersRequired", "1"],
    ["CustomerEmail", input.customer.email],
    ["CustomerFirstNames", input.customer.firstName],
    ["CustomerFamilyName", input.customer.lastName],
    ["Note", input.description.slice(0, 100)],
  ];
  // Cart: full-price lines, then loyalty credit as a negative line so the cart adds up to Amount.
  const lines = input.lineItems.map((l) => ({ name: l.name, qty: l.quantity, price: l.unitPriceCents, total: l.totalCents }));
  if (input.discountCents > 0) lines.push({ name: "Loyalty credit", qty: 1, price: -input.discountCents, total: -input.discountCents });
  if (lines.length) {
    fields.push(["CartItems", String(lines.length)]);
    lines.forEach((l, i) => {
      const n = i + 1;
      fields.push([`Article_${n}`, l.name], [`Quantity_${n}`, String(l.qty)], [`Price_${n}`, myposAmount(l.price)], [`Amount_${n}`, myposAmount(l.total)], [`Currency_${n}`, input.currency]);
    });
  }
  fields.push(["Signature", myposSign(fields.map(([, v]) => v), cfg.privateKeyPem)]);
  return fields;
}

/** Parses a form-urlencoded body keeping field order, which the signature depends on. */
export function parseOrderedForm(rawBody: string): [string, string][] {
  return [...new URLSearchParams(rawBody).entries()];
}

export class MyPosProvider implements PaymentProvider {
  readonly name = "mypos" as const;
  readonly publicKey = null;
  /** myPOS has no status lookup here: unpaid orders are expired by reconciliation. */
  readonly getOrder = null;

  constructor(
    private cfg: MyPosConfig,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  async createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
    return {
      providerOrderId: input.reference,
      token: null,
      redirect: { action: MYPOS_ENDPOINTS[this.cfg.mode], fields: buildPurchaseFields(this.cfg, input) },
    };
  }

  verifyWebhook(rawBody: string): boolean {
    const fields = parseOrderedForm(rawBody);
    const sig = fields.find(([k]) => k === "Signature")?.[1];
    if (!sig) return false;
    // Sign over every field received except Signature: myPOS may add fields over time.
    return myposVerify(fields.filter(([k]) => k !== "Signature").map(([, v]) => v), sig, this.cfg.myposCertPem);
  }

  parseWebhook(rawBody: string): WebhookEvent {
    const f = Object.fromEntries(parseOrderedForm(rawBody));
    if (f.IPCmethod && f.IPCmethod !== "IPCPurchaseNotify") throw new Error(`Unexpected myPOS method ${f.IPCmethod}`);
    if (!f.OrderID) throw new Error("Malformed myPOS notification");
    if (f.SID && f.SID !== this.cfg.sid) throw new Error("Notification for another store");
    return { event: "ORDER_COMPLETED", providerOrderId: f.OrderID, state: "completed", amountCents: parseAmount(f.Amount), txnRef: f.IPC_Trnref };
  }

  /** IPCRefund, server-to-server. Field set per myPOS docs; confirm against the sandbox before going live. */
  async refund(order: { providerOrderId: string; txnRef: string | null; amountCents: number }, _reason?: string) {
    if (!order.txnRef) throw new Error("No myPOS transaction reference to refund");
    const fields: [string, string][] = [
      ["IPCmethod", "IPCRefund"],
      ["IPCVersion", "1.4"],
      ["IPCLanguage", "EN"],
      ["SID", this.cfg.sid],
      ["WalletNumber", this.cfg.walletNumber],
      ["IPC_Trnref", order.txnRef],
      ["OrderID", order.providerOrderId],
      ["Amount", myposAmount(order.amountCents)],
      ["Currency", "EUR"],
      ["KeyIndex", String(this.cfg.keyIndex)],
      ["OutputFormat", "json"],
    ];
    fields.push(["Signature", myposSign(fields.map(([, v]) => v), this.cfg.privateKeyPem)]);
    const res = await this.fetchImpl(MYPOS_ENDPOINTS[this.cfg.mode], { method: "POST", body: new URLSearchParams(fields) });
    const text = await res.text();
    let status: unknown;
    try {
      status = (JSON.parse(text) as { Status?: unknown }).Status;
    } catch {
      throw new Error(`myPOS refund: unreadable response (${res.status})`);
    }
    if (String(status) !== "0") throw new Error(`myPOS refund failed: ${text.slice(0, 200)}`);
  }
}
