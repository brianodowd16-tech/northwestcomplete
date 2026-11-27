// A tiny per-process cache for hot, rarely-changing reads (venue, menu, What's on).
// Short TTLs keep several app servers in step without shared state; writes on this
// server clear the venue's entries at once. Concurrent misses share one query.
const store = new Map<string, { at: number; ttl: number; value: Promise<unknown> }>();

export function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.value as Promise<T>;
  const value = load();
  store.set(key, { at: Date.now(), ttl: ttlMs, value });
  value.catch(() => store.delete(key)); // never cache a failure
  if (store.size > 5000) for (const [k, v] of store) if (Date.now() - v.at >= v.ttl) store.delete(k);
  return value;
}

/** Drops every cached entry mentioning this venue (call after writes to its menu, events or settings). */
export function invalidateVenue(venueId: string) {
  for (const k of store.keys()) if (k.includes(venueId)) store.delete(k);
}

export function clearCache() {
  store.clear();
}
