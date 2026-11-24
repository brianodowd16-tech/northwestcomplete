// Scheduled background work, run by pg-boss on the app's own Postgres. Schedules
// are stored in the database, so several app instances never run a job twice.
import { localDate } from "@round/core";
import { venuesWithXero, syncXeroDay, xeroHistory } from "@round/db/integrations";
import { reconcilePending, venueById } from "@round/db/services";
import PgBoss from "pg-boss";
import { refreshTopGames } from "./lib/sportsfeed";
import { providerFor, secretsKey, xeroApp } from "./lib/server";

const RECONCILE = "reconcile-payments";
const XERO_NIGHTLY = "xero-nightly";
const TOP_GAMES = "top-games";

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
  for (const q of [RECONCILE, XERO_NIGHTLY, TOP_GAMES]) await boss.createQueue(q);
  await boss.schedule(RECONCILE, "* * * * *");
  await boss.schedule(XERO_NIGHTLY, "15 3 * * *", undefined, { tz: "Europe/Dublin" });
  await boss.work(RECONCILE, reconcile);
  await boss.work(XERO_NIGHTLY, xeroNightly);
  // Ireland's top televised games for the next week, refreshed every morning (and once at start-up).
  await boss.schedule(TOP_GAMES, "40 5 * * *", undefined, { tz: "Europe/Dublin" });
  await boss.work(TOP_GAMES, async () => console.log(`top games: ${await refreshTopGames()} listed`));
  if (process.env.SPORTS_FEED !== "off") await boss.send(TOP_GAMES, {}, { singletonKey: "boot", singletonSeconds: 3600 });
  return boss;
}

startJobs().catch((e) => console.error("jobs failed to start", e));
