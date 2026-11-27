// Scheduled background work, run by pg-boss on the app's own Postgres. Schedules
// are stored in the database, so several app instances never run a job twice.
import { localDate } from "@round/core";
import { syncHistory, syncSageDay, syncXeroDay, venuesWith } from "@round/db/integrations";
import { reconcilePending, venueById } from "@round/db/services";
import PgBoss from "pg-boss";
import { refreshTopGames } from "./lib/sportsfeed";
import { uploadBizimply } from "./lib/bizimply";
import { sendDeel } from "./lib/deelsync";
import { healthCheck, monthlyBilling, onboardingNudges, retention } from "./lib/autopilot";
import { sendDueEmails } from "./lib/mail";
import { socialTick } from "./lib/social";
import { sceneTick } from "./lib/controls";
import { recordError } from "@round/db/platform";
import { sendPayroll } from "./lib/payrollsync";
import { providerFor, sageApp, secretsKey, xeroApp } from "./lib/server";

const MINUTE = "every-minute";
const XERO_NIGHTLY = "xero-nightly";
const TOP_GAMES = "top-games";
const PAYROLL = "payroll-send";
const BIZIMPLY = "bizimply-sales";
const HEALTH = "venue-health";
const NUDGES = "onboarding-nudges";
const BILLING = "monthly-billing";
const RETENTION = "data-retention";
const SOCIAL = "social-posts";

/** Runs a job, recording any failure for the operator console before pg-boss retries it. */
const tracked = (name: string, fn: () => Promise<unknown>) => async () => {
  try {
    const r = await fn();
    if (r) console.log(`${name}: ${typeof r === "object" ? JSON.stringify(r) : r}`);
  } catch (e) {
    await recordError(e, `job ${name}`);
    throw e;
  }
};

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

/** Everything that must run every minute, each tracked on its own so one failure never blocks the others. */
async function everyMinute() {
  const parts: [string, () => Promise<unknown>][] = [["payments", reconcile], ["emails", sendDueEmails], ["scenes", sceneTick]];
  for (const [name, fn] of parts) await tracked(name, fn)().catch(() => {});
}

const DUBLIN = { tz: "Europe/Dublin" };
/** Every scheduled job in one table: queue, cron (Dublin time unless noted), work. */
const SCHEDULE: [string, string, () => Promise<unknown>, { tz: string }?][] = [
  [MINUTE, "* * * * *", everyMinute],
  [SOCIAL, "*/5 * * * *", socialTick],
  [HEALTH, "7 * * * *", healthCheck],
  [XERO_NIGHTLY, "15 3 * * *", accountsNightly, DUBLIN],
  [BIZIMPLY, "35 4 * * *", bizimplyDaily, DUBLIN], // before Bizimply's 6.30am pick-up
  [TOP_GAMES, "40 5 * * *", async () => `top games: ${await refreshTopGames()} listed`, DUBLIN],
  [PAYROLL, "20 6 * * *", payrollDaily, DUBLIN], // pay periods close at midnight
  [NUDGES, "5 10 * * *", onboardingNudges, DUBLIN],
  [BILLING, "10 7 1 * *", monthlyBilling, DUBLIN],
  [RETENTION, "50 3 * * *", retention, DUBLIN],
];

export async function startJobs() {
  const boss = new PgBoss({ connectionString: process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL, schema: "pgboss", max: Number(process.env.JOBS_POOL_MAX) || 3 });
  boss.on("error", (e) => console.error("jobs", e));
  await boss.start();
  // Older per-minute queues were folded into MINUTE: drop their stored schedules.
  for (const old of ["reconcile-payments", "email-retry", "control-scenes"]) await boss.unschedule(old).catch(() => {});
  for (const [name, cron, fn, opts] of SCHEDULE) {
    await boss.createQueue(name);
    await boss.schedule(name, cron, undefined, opts);
    await boss.work(name, tracked(name, fn));
  }
  if (process.env.SPORTS_FEED !== "off") await boss.send(TOP_GAMES, {}, { singletonKey: "boot", singletonSeconds: 3600 });
  return boss;
}

// If the database isn't reachable at boot (a deploy during a blip), keep retrying: payments,
// emails and syncs must never silently stay off until the next restart.
function boot(attempt = 1) {
  startJobs().catch((e) => {
    console.error(`jobs failed to start (attempt ${attempt}), retrying`, e instanceof Error ? e.message : e);
    setTimeout(() => boot(attempt + 1), Math.min(60_000, 2_000 * attempt));
  });
}
boot();
