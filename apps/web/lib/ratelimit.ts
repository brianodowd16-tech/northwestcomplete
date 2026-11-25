import "server-only";
import { rateAllow } from "@round/db/platform";
import { headers } from "next/headers";

// Shared limits live in Postgres (rate_bucket) so every app instance counts the same
// attempts. If the database can't be reached, a per-instance window keeps limiting.
const hits = new Map<string, number[]>();

/** True if `key` has made fewer than `limit` calls in the current window. Records this call. */
export async function allow(key: string, limit: number, windowMs: number): Promise<boolean> {
  try {
    return await rateAllow(key, limit, windowMs);
  } catch {
    return allowLocal(key, limit, windowMs);
  }
}

function allowLocal(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 10_000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return true;
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "local";
}
