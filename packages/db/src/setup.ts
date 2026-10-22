// Dev only: drops everything, applies migrations + RLS, seeds both pilot venues.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { pool, systemDb } from "./index";
import { DEMO_STAFF_PASSWORD, seed } from "./seed";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export async function resetDatabase() {
  const db = systemDb();
  await db.execute(sql`drop schema if exists public cascade`);
  await db.execute(sql`drop schema if exists drizzle cascade`);
  await db.execute(sql`create schema public`);
  await migrate(db, { migrationsFolder: join(root, "migrations") });
  await db.execute(sql.raw(readFileSync(join(root, "sql/rls.sql"), "utf8")));
  return db;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.env.DATABASE_URL ??= "postgres://round:round@localhost:5432/round";
  const db = await resetDatabase();
  const venues = await seed(db);
  console.log("Seeded. Staff password for both venues:", DEMO_STAFF_PASSWORD);
  for (const v of Object.values(venues)) console.log(`  /v/${v.slug}/t/${v.tables[0]}  (table 1)`);
  await pool().end();
}
