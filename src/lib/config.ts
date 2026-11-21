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
  heroImage: "https://odowdscarrick.com/wp-content/uploads/2022/10/Studio-1-Edge-1.jpg",
  showroomImage: "https://odowdscarrick.com/wp-content/uploads/2020/11/IMG_20201117_111759-scaled-e1606137354380.jpg",
  consultImage: "https://odowdscarrick.com/wp-content/uploads/2026/02/pulsetrimroomset_1400x1400.webp",
  currency: "EUR",
} as const;

/** Cover photography for the main range categories on the homepage. */
export const RANGE_COVERS: Record<string, string> = {
  stoves: "https://odowdscarrick.com/wp-content/uploads/2026/04/teodora.webp",
  fireplaces: "https://odowdscarrick.com/wp-content/uploads/2026/02/pro-AoPbVevG-scaled.jpeg",
  "gas-fires": "https://odowdscarrick.com/wp-content/uploads/2025/05/gazco-riva-2-600.jpg",
  "electric-fires": "https://odowdscarrick.com/wp-content/uploads/2024/11/hdi4-2-scaled.jpeg",
};

/** Merchandising rules for the homepage. Prices in cents. */
export const MERCH = {
  /** Only products priced above this appear on the homepage (the full list stays on /shop). */
  featuredMinCents: 100_00,
  featuredCount: 4,
} as const;

/** Manufacturers carried in the showroom (from the current range pages). */
export const BRANDS = [
  "Stovax",
  "Gazco",
  "Jøtul",
  "Nordica Extraflame",
  "Nestor Martin",
  "Dik Geurts",
  "Mazona",
  "ACR",
  "Heat Design",
  "Evonic",
  "Esse",
  "Edilkamin",
] as const;
