import "server-only";
import { decryptSecret, signBody } from "@round/core";
import { loadIntegration } from "@round/db/integrations";
import type { Venue } from "@round/db/services";
import { secretsKey } from "./server";

/** The venue's secret for one integration (delivery webhook, PMS), decrypted. Null if not set up. */
export async function integrationSecret(venue: Venue, kind: "delivery" | "pms"): Promise<{ secret: string; config: Record<string, unknown> } | null> {
  const row = await loadIntegration(venue, kind);
  const key = secretsKey();
  if (!row?.secretEnc || !key) return null;
  return { secret: decryptSecret(row.secretEnc, key), config: row.config };
}

/** Posts a room charge to the hotel's property management system (or its middleware), signed. */
export async function postRoomCharge(venue: Venue, charge: { orderNumber: number; roomNumber: string; amountCents: number; lines: { name: string; qty: number; grossCents: number }[] }) {
  const pms = await integrationSecret(venue, "pms");
  const url = pms?.config.url;
  if (!pms || typeof url !== "string" || !/^https:\/\//.test(url)) return false;
  const body = JSON.stringify({ type: "room_charge", venue: venue.slug, outlet: venue.name, ...charge, currency: "EUR", at: new Date().toISOString() });
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "X-Complete-Signature": `sha256=${signBody(body, pms.secret)}` }, body, signal: AbortSignal.timeout(10_000) });
  return res.ok;
}
