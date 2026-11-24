// Production: applies new migrations and RLS policies. Never drops data. SEED_DEMO=1 adds the two
// demo venues to an empty database (for a staging site).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { pool, systemDb } from "./index";
import * as t from "./schema";
import { seed } from "./seed";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
try {
  process.loadEnvFile(join(root, "../../.env")); // local runs; in production the host sets the environment
} catch {}

export async function migrateDatabase() {
  const db = systemDb();
  await migrate(db, { migrationsFolder: join(root, "migrations") });
  await db.execute(sql.raw(readFileSync(join(root, "sql/rls.sql"), "utf8")));
  if (process.env.SEED_DEMO === "1") {
    const [any] = await db.select({ id: t.venue.id }).from(t.venue).limit(1);
    if (!any) await seed(db);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await migrateDatabase();
  console.log("Database is up to date.");
  await pool().end();
}
