// myPOS Checkout (IPC v1.4) — hosted payment page integration without the PHP SDK.
//
// Requests are signed exactly like the official SDK (IPC/Base.php):
//   signature = base64( RSA-SHA256( base64( values.join("-") ), storePrivateKey ) )
// over every parameter value in send order, empty values included. Responses from myPOS
// (IPCPurchaseNotify, IPCPurchaseOK, IPCPurchaseCancel) are verified the same way with the
// myPOS public certificate, after removing the Signature field.
import { createHmac, createPublicKey, sign, verify } from "node:crypto";

export const MYPOS_URLS = {
  production: "https://www.mypos.com/vmp/checkout",
  sandbox: "https://www.mypos.com/vmp/checkout-test",
};

export type MyposConfig = {
  sid: string;
  walletNumber: string;
  keyIndex: string;
  /** Store private key (PEM) used to sign requests. */
  privateKey: string;
  /** myPOS public certificate (PEM) used to verify callbacks. */
  publicCert: string;
  sandbox: boolean;
};

export type MyposCartItem = { article: string; quantity: number; /** unit price in cents */ price: number };

export type MyposCustomer = {
  email: string;
  phone: string;
  firstNames: string;
  familyName: string;
  /** ISO 3166-1 alpha-3, e.g. IRL, MLT, GBR */
  country: string;
  city: string;
  zip: string;
  address: string;
};

export type MyposPurchase = {
  orderId: string;
  currency: string;
  items: MyposCartItem[];
  customer: MyposCustomer;
  urlOk: string;
  urlCancel: string;
  urlNotify: string;
  note?: string;
  language?: string;
};

/** Environment variables can hold PEMs with literal "\n" sequences. */
const pem = (v: string) => v.replace(/\\n/g, "\n").trim() + "\n";

export function getMyposConfig(env: Record<string, string | undefined> = process.env): MyposConfig | null {
  const { MYPOS_SID, MYPOS_WALLET_NUMBER, MYPOS_KEY_INDEX, MYPOS_PRIVATE_KEY, MYPOS_PUBLIC_CERT, MYPOS_SANDBOX } = env;
  if (!MYPOS_SID || !MYPOS_WALLET_NUMBER || !MYPOS_KEY_INDEX || !MYPOS_PRIVATE_KEY || !MYPOS_PUBLIC_CERT) return null;
  return {
    sid: MYPOS_SID,
    walletNumber: MYPOS_WALLET_NUMBER,
    keyIndex: MYPOS_KEY_INDEX,
    privateKey: pem(MYPOS_PRIVATE_KEY),
    publicCert: pem(MYPOS_PUBLIC_CERT),
    sandbox: MYPOS_SANDBOX === "true",
  };
}

/** Cents → "12.34", the format myPOS expects for amounts. */
export const toAmount = (cents: number) => (Math.round(cents) / 100).toFixed(2);

export function signValues(values: string[], privateKey: string) {
  const data = Buffer.from(values.join("-"), "utf8").toString("base64");
  return sign("sha256", Buffer.from(data, "utf8"), privateKey).toString("base64");
}

export function verifyValues(values: string[], signature: string, publicCert: string) {
  const data = Buffer.from(values.join("-"), "utf8").toString("base64");
  try {
    return verify("sha256", Buffer.from(data, "utf8"), createPublicKey(publicCert), Buffer.from(signature, "base64"));
  } catch {
    return false;
  }
}

/**
 * Builds the signed IPCPurchase form fields, in the same order as the official SDK.
 * The browser posts these as a form to `url`.
 */
export function buildPurchase(cfg: MyposConfig, p: MyposPurchase) {
  const total = p.items.reduce((n, i) => n + i.price * i.quantity, 0);
  const c = p.customer;
  const fields: [string, string][] = [
    ["IPCmethod", "IPCPurchase"],
    ["IPCVersion", "1.4"],
    ["IPCLanguage", p.language ?? "en"],
    ["SID", cfg.sid],
    ["WalletNumber", cfg.walletNumber],
    ["KeyIndex", cfg.keyIndex],
    ["Source", "NWBM_NEXTJS_1.0"],
    ["Currency", p.currency],
    ["Amount", toAmount(total)],
    ["OrderID", p.orderId],
    ["URL_OK", p.urlOk],
    ["URL_Cancel", p.urlCancel],
    ["URL_Notify", p.urlNotify],
    ["Note", p.note ?? ""],
    ["expires_in", "86400"],
    ["ApplicationID", ""],
    ["PartnerID", ""],
    ["customeremail", c.email],
    ["customerphone", c.phone],
    ["customerfirstnames", c.firstNames],
    ["customerfamilyname", c.familyName],
    ["customercountry", c.country],
    ["customercity", c.city],
    ["customerzipcode", c.zip],
    ["customeraddress", c.address],
    ["CartItems", String(p.items.length)],
  ];
  p.items.forEach((item, idx) => {
    const n = idx + 1;
    fields.push(
      [`Article_${n}`, item.article],
      [`Quantity_${n}`, String(item.quantity)],
      [`Price_${n}`, toAmount(item.price)],
      [`Amount_${n}`, toAmount(item.price * item.quantity)],
      [`Currency_${n}`, p.currency],
    );
  });
  fields.push(
    ["CardTokenRequest", "0"],
    ["PaymentParametersRequired", "1"],
    ["PaymentMethod", "3"],
  );
  fields.push(["Signature", signValues(fields.map(([, v]) => v), cfg.privateKey)]);
  return { url: cfg.sandbox ? MYPOS_URLS.sandbox : MYPOS_URLS.production, fields, amount: total };
}

/**
 * Verifies a callback from myPOS. `entries` must be in the order they were received.
 * Returns the fields as a lower-cased map when the signature is valid, otherwise null.
 */
export function verifyCallback(cfg: MyposConfig, entries: [string, string][]) {
  const sig = entries.find(([k]) => k.toLowerCase() === "signature")?.[1];
  if (!sig) return null;
  const rest = entries.filter(([k]) => k.toLowerCase() !== "signature");
  if (!verifyValues(rest.map(([, v]) => v), sig, cfg.publicCert)) return null;
  return Object.fromEntries(rest.map(([k, v]) => [k.toLowerCase(), v]));
}

/** Short tamper-proof token carried on our own callback URLs (e.g. who to send the receipt to). */
export function sealToken(data: object, secret: string) {
  const body = Buffer.from(JSON.stringify(data)).toString("base64url");
  const mac = createHmac("sha256", secret).update(body).digest("base64url").slice(0, 22);
  return `${body}.${mac}`;
}

export function openToken<T>(token: string | null | undefined, secret: string): T | null {
  if (!token) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expect = createHmac("sha256", secret).update(body).digest("base64url").slice(0, 22);
  if (expect !== mac) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

export const tokenSecret = (cfg: MyposConfig) => createHmac("sha256", "nwbm-order-token").update(cfg.privateKey).digest("hex");
