import "server-only";
import { MYPOS_SANDBOX } from "./mypos-sandbox";

export const SITE_URL = (process.env.SITE_URL || "http://localhost:3000").replace(/\/$/, "");

export const WC_URL = (process.env.WC_URL || "https://odowdscarrick.com").replace(/\/$/, "");

export function wooCredentials() {
  const key = process.env.WC_CONSUMER_KEY;
  const secret = process.env.WC_CONSUMER_SECRET;
  if (!key || !secret) return null;
  return { key, secret };
}

export type MyPosConfig = {
  mode: "sandbox" | "live";
  url: string;
  sid: string;
  walletNumber: string;
  keyIndex: string;
  privateKey: string;
  publicCert: string;
};

const pem = (v: string) => v.replace(/\\n/g, "\n").trim();

/**
 * myPOS settings. MYPOS_MODE=live needs real credentials, either as the
 * "configuration pack" from the myPOS account (MYPOS_CONFIG_PACK) or as
 * separate variables. Anything else uses the public sandbox.
 */
export function myposConfig(): MyPosConfig {
  if (process.env.MYPOS_MODE !== "live") {
    return { mode: "sandbox", ...MYPOS_SANDBOX };
  }

  let pack: Partial<Record<"sid" | "cn" | "pk" | "pc" | "idx", string | number>> = {};
  if (process.env.MYPOS_CONFIG_PACK) {
    pack = JSON.parse(Buffer.from(process.env.MYPOS_CONFIG_PACK, "base64").toString("utf8"));
  }

  const cfg = {
    mode: "live" as const,
    url: process.env.MYPOS_URL || "https://www.mypos.com/vmp/checkout",
    sid: String(process.env.MYPOS_SID ?? pack.sid ?? ""),
    walletNumber: String(process.env.MYPOS_WALLET_NUMBER ?? pack.cn ?? ""),
    keyIndex: String(process.env.MYPOS_KEY_INDEX ?? pack.idx ?? ""),
    privateKey: pem(String(process.env.MYPOS_PRIVATE_KEY ?? pack.pk ?? "")),
    publicCert: pem(String(process.env.MYPOS_PUBLIC_CERT ?? pack.pc ?? "")),
  };

  const missing = Object.entries(cfg).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) throw new Error(`MYPOS_MODE=live but missing: ${missing.join(", ")}`);
  return cfg;
}

export const STORE = {
  name: "O'Dowd's Fireplaces & Stoves",
  shortName: "O'Dowds",
  since: 1967,
  phone: "071 96 20153",
  phoneIntl: "+353719620153",
  email: "info@odowdscarrick.com",
  address: {
    street: "Station Road",
    town: "Carrick-on-Shannon",
    county: "Co. Roscommon",
    eircode: "N41 DW99",
    country: "IE",
  },
  mapUrl: "https://www.google.com/maps/search/?api=1&query=O%27Dowds+Fireplaces+and+Stoves+Carrick+on+Shannon",
  logo: "https://odowdscarrick.com/wp-content/uploads/2020/11/cropped-LOGO-2020-600x306.png",
  heroImage: "https://odowdscarrick.com/wp-content/uploads/2020/11/IMG_20201117_111759-scaled-e1606137354380.jpg",
  currency: "EUR",
} as const;
