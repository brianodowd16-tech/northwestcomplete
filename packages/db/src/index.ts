import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

export * as schema from "./schema";
export { schema as tables };

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const g = globalThis as { __roundPool?: pg.Pool };

export function pool(): pg.Pool {
  g.__roundPool ??= new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  return g.__roundPool;
}

/**
 * Unscoped access, bypassing RLS. Only for platform-level lookups that happen
 * before a tenant is known (resolving a venue slug, a QR token, a webhook's
 * order, a session's staff user) and for platform-level tables.
 */
export function systemDb(): Db {
  return drizzle(pool(), { schema });
}

/** Runs `fn` in a transaction where RLS limits every query to one tenant. */
export async function withTenant<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return systemDb().transaction(async (tx) => {
    await tx.execute(sql`set local role round_app`);
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
}

export const EVENTS_CHANNEL = "round_events";

/** Publishes a realtime event. Delivered to listeners when the transaction commits. */
export async function publish(tx: Tx | Db, topic: string, data: Record<string, unknown> = {}) {
  await tx.execute(sql`select pg_notify(${EVENTS_CHANNEL}, ${JSON.stringify({ topic, ...data })})`);
}

export const topics = {
  venue: (venueId: string) => `venue:${venueId}`,
  order: (orderId: string) => `order:${orderId}`,
};
