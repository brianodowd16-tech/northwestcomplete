import crypto from "node:crypto";
import { centsToDecimal } from "./money";
import type { MyPosConfig } from "./config";

/**
 * myPOS Checkout (IPC v1.4). Signing follows the official PHP SDK:
 * every value in send order is joined with "-", the joined string is
 * base64-encoded, and that text is signed with RSA-SHA256.
 */

export type Fields = [string, string][];

const encode = (values: string[]) => Buffer.from(values.join("-")).toString("base64");

export function sign(fields: Fields, privateKey: string): string {
  return crypto.createSign("RSA-SHA256").update(encode(fields.map(([, v]) => v))).sign(privateKey, "base64");
}

/** Verifies a myPOS callback. `fields` must be in the order they were received. */
export function verify(fields: Fields, publicCert: string): boolean {
  const sig = fields.find(([k]) => k.toLowerCase() === "signature")?.[1];
  if (!sig) return false;
  const values = fields.filter(([k]) => k.toLowerCase() !== "signature").map(([, v]) => v);
  try {
    return crypto.createVerify("RSA-SHA256").update(encode(values)).verify(publicCert, Buffer.from(sig, "base64"));
  } catch {
    return false;
  }
}

export type PurchaseItem = { name: string; quantity: number; unitCents: number };

export type PurchaseInput = {
  orderId: string;
  currency: string;
  totalCents: number;
  items: PurchaseItem[];
  customer: {
    email: string;
    phone: string;
    firstName: string;
    lastName: string;
    country: string; // ISO 3166-1 alpha-3, e.g. IRL
    city: string;
    zip: string;
    address: string;
  };
  urls: { ok: string; cancel: string; notify: string };
  note?: string;
};

// The checkout page rejects some characters in free-text fields, and the PHP
// SDK HTML-escapes them before sending. Keep text plain so both sides sign the same bytes.
const clean = (s: string, max = 100) =>
  s.replace(/[<>"'&\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

/**
 * Builds the signed POST fields for IPCPurchase. Item amounts always add up
 * to the order total; any rounding difference goes on a final adjustment line.
 */
export function buildPurchase(cfg: MyPosConfig, input: PurchaseInput): { url: string; fields: Fields } {
  const lines = input.items.filter((i) => i.quantity > 0);
  let sum = lines.reduce((t, i) => t + i.unitCents * i.quantity, 0);
  const cart: PurchaseItem[] = [...lines];
  if (sum !== input.totalCents) {
    cart.push({ name: sum < input.totalCents ? "Charges" : "Discount", quantity: 1, unitCents: input.totalCents - sum });
    sum = input.totalCents;
  }

  const c = input.customer;
  const fields: Fields = [
    ["IPCmethod", "IPCPurchase"],
    ["IPCVersion", "1.4"],
    ["IPCLanguage", "en"],
    ["SID", cfg.sid],
    ["WalletNumber", cfg.walletNumber],
    ["KeyIndex", cfg.keyIndex],
    ["Source", "northwestcomplete"],
    ["Currency", input.currency],
    ["Amount", centsToDecimal(input.totalCents)],
    ["OrderID", input.orderId],
    ["URL_OK", input.urls.ok],
    ["URL_Cancel", input.urls.cancel],
    ["URL_Notify", input.urls.notify],
    ["Note", clean(input.note ?? "", 200)],
    ["expires_in", "86400"],
    ["ApplicationID", ""],
    ["PartnerID", ""],
    ["customeremail", clean(c.email)],
    ["customerphone", clean(c.phone, 30)],
    ["customerfirstnames", clean(c.firstName)],
    ["customerfamilyname", clean(c.lastName)],
    ["customercountry", clean(c.country, 3)],
    ["customercity", clean(c.city)],
    ["customerzipcode", clean(c.zip, 20)],
    ["customeraddress", clean(c.address)],
    ["CartItems", String(cart.length)],
  ];
  cart.forEach((item, i) => {
    const n = i + 1;
    fields.push(
      [`Article_${n}`, clean(item.name)],
      [`Quantity_${n}`, String(item.quantity)],
      [`Price_${n}`, centsToDecimal(item.unitCents)],
      [`Amount_${n}`, centsToDecimal(item.unitCents * item.quantity)],
      [`Currency_${n}`, input.currency],
    );
  });
  fields.push(["CardTokenRequest", "0"], ["PaymentParametersRequired", "1"], ["PaymentMethod", "1"]);
  fields.push(["Signature", sign(fields, cfg.privateKey)]);
  return { url: cfg.url, fields };
}

/** Parses a urlencoded body while keeping field order, which signature checks depend on. */
export function parseFields(body: string): Fields {
  return [...new URLSearchParams(body).entries()];
}

/**
 * myPOS OrderIDs must never repeat (the sandbox is shared by every merchant),
 * so the WooCommerce order id gets a time suffix: ODW1234T<base36 ms>.
 */
export const toMyPosOrderId = (wooId: number, now = Date.now()) => `ODW${wooId}T${now.toString(36).toUpperCase()}`;

export function fromMyPosOrderId(id: string): number | null {
  const m = /^ODW(\d+)T[0-9A-Z]+$/.exec(id);
  return m ? Number(m[1]) : null;
}
