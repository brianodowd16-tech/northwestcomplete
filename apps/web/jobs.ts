// Scheduled background work, run by pg-boss on the app's own Postgres. Schedules
// are stored in the database, so several app instances never run a job twice.
import { localDate } from "@round/core";
import { venuesWithXero, syncXeroDay, xeroHistory } from "@round/db/integrations";
import { reconcilePending, venueById } from "@round/db/services";
import PgBoss from "pg-boss";
import { providerFor, secretsKey, xeroApp } from "./lib/server";

const RECONCILE = "reconcile-payments";
const XERO_NIGHTLY = "xero-nightly";

async function reconcile() {
  await reconcilePending(async (venueId) => providerFor(await venueById(venueId)));
}

/** Pushes yesterday to Xero for every connected venue, and retries failed days from the past week. */
async function xeroNightly() {
  const app = xeroApp();
  const key = secretsKey();
  if (!app || !key) return;
  for (const venue of await venuesWithXero()) {
    const days = new Set<string>([localDate(new Date(Date.now() - 86_400_000), venue.timezone)]);
    const weekAgo = localDate(new Date(Date.now() - 7 * 86_400_000), venue.timezone);
    for (const h of await xeroHistory(venue)) if (h.status === "error" && h.businessDate >= weekAgo) days.add(h.businessDate);
    for (const day of days) {
      const result = await syncXeroDay(venue, day, app, key);
      if (result === "error" || result === "not_mapped") console.warn(`Xero ${venue.slug} ${day}: ${result}`);
    }
  }
}

export async function startJobs() {
  const boss = new PgBoss({ connectionString: process.env.DATABASE_URL, schema: "pgboss" });
  boss.on("error", (e) => console.error("jobs", e));
  await boss.start();
  for (const q of [RECONCILE, XERO_NIGHTLY]) await boss.createQueue(q);
  await boss.schedule(RECONCILE, "* * * * *");
  await boss.schedule(XERO_NIGHTLY, "15 3 * * *", undefined, { tz: "Europe/Dublin" });
  await boss.work(RECONCILE, reconcile);
  await boss.work(XERO_NIGHTLY, xeroNightly);
  return boss;
}

startJobs().catch((e) => console.error("jobs failed to start", e));
