// Scheduled background work, run by pg-boss on the app's own Postgres. Schedules
// are stored in the database, so several app instances never run a job twice.
import { localDate } from "@round/core";
import { syncHistory, syncSageDay, syncXeroDay, venuesWith } from "@round/db/integrations";
import { reconcilePending, venueById } from "@round/db/services";
import PgBoss from "pg-boss";
import { refreshTopGames } from "./lib/sportsfeed";
import { uploadBizimply } from "./lib/bizimply";
import { sendDeel } from "./lib/deelsync";
import { sendPayroll } from "./lib/payrollsync";
import { providerFor, sageApp, secretsKey, xeroApp } from "./lib/server";

const RECONCILE = "reconcile-payments";
const XERO_NIGHTLY = "xero-nightly";
const TOP_GAMES = "top-games";
const PAYROLL = "payroll-send";
const BIZIMPLY = "bizimply-sales";

async function reconcile() {
  await reconcilePending(async (venueId) => providerFor(await venueById(venueId)));
}

/** Days to push: yesterday, plus failed days from the past week. */
async function daysToPush(venue: Awaited<ReturnType<typeof venuesWith>>[number], target: "xero" | "sage" | "bizimply") {
  const days = new Set<string>([localDate(new Date(Date.now() - 86_400_000), venue.timezone)]);
  const weekAgo = localDate(new Date(Date.now() - 7 * 86_400_000), venue.timezone);
  for (const h of await syncHistory(venue, target)) if (h.status === "error" && h.businessDate >= weekAgo) days.add(h.businessDate);
  return days;
}

/** Pushes yesterday's sales to Xero and to Sage for every connected venue. */
async function accountsNightly() {
  const key = secretsKey();
  if (!key) return;
  const xero = xeroApp(), sage = sageApp();
  if (xero)
    for (const venue of await venuesWith("xero"))
      for (const day of await daysToPush(venue, "xero")) {
        const result = await syncXeroDay(venue, day, xero, key);
        if (result === "error" || result === "not_mapped") console.warn(`Xero ${venue.slug} ${day}: ${result}`);
      }
  if (sage)
    for (const venue of await venuesWith("sage"))
      for (const day of await daysToPush(venue, "sage")) {
        const result = await syncSageDay(venue, day, sage, key);
        if (result === "error" || result === "not_mapped") console.warn(`Sage ${venue.slug} ${day}: ${result}`);
      }
}

/** Sends each venue's last closed pay period to its payroll (once per period; failures retry next morning). */
async function payrollDaily() {
  for (const venue of await venuesWith("payroll")) {
    const r = await sendPayroll(venue);
    if (r.result === "error") console.warn(`Payroll ${venue.slug} ${r.period?.start}: ${r.error}`);
  }
  for (const venue of await venuesWith("deel")) {
    const r = await sendDeel(venue);
    if (r.result === "error") console.warn(`Deel ${venue.slug} ${r.period?.start}: ${r.error}`);
  }
}

/** Yesterday's sales (and failed days from the past week) to Bizimply's SFTP folder, before its 6.30am pick-up. */
async function bizimplyDaily() {
  for (const venue of await venuesWith("bizimply"))
    for (const day of await daysToPush(venue, "bizimply")) {
      const r = await uploadBizimply(venue, day);
      if (r.result === "error") console.warn(`Bizimply ${venue.slug} ${day}: ${r.error}`);
    }
}

export async function startJobs() {
  const boss = new PgBoss({ connectionString: process.env.DATABASE_URL, schema: "pgboss" });
  boss.on("error", (e) => console.error("jobs", e));
  await boss.start();
  for (const q of [RECONCILE, XERO_NIGHTLY, TOP_GAMES, PAYROLL, BIZIMPLY]) await boss.createQueue(q);
  await boss.schedule(RECONCILE, "* * * * *");
  await boss.schedule(XERO_NIGHTLY, "15 3 * * *", undefined, { tz: "Europe/Dublin" });
  await boss.work(RECONCILE, reconcile);
  await boss.work(XERO_NIGHTLY, accountsNightly);
  // Pay periods close at midnight Sunday (or month end): send them first thing.
  await boss.schedule(PAYROLL, "20 6 * * *", undefined, { tz: "Europe/Dublin" });
  await boss.work(PAYROLL, payrollDaily);
  await boss.schedule(BIZIMPLY, "35 4 * * *", undefined, { tz: "Europe/Dublin" });
  await boss.work(BIZIMPLY, bizimplyDaily);
  // Ireland's top televised games for the next week, refreshed every morning (and once at start-up).
  await boss.schedule(TOP_GAMES, "40 5 * * *", undefined, { tz: "Europe/Dublin" });
  await boss.work(TOP_GAMES, async () => console.log(`top games: ${await refreshTopGames()} listed`));
  if (process.env.SPORTS_FEED !== "off") await boss.send(TOP_GAMES, {}, { singletonKey: "boot", singletonSeconds: 3600 });
  return boss;
}

startJobs().catch((e) => console.error("jobs failed to start", e));
