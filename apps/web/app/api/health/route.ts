import { pool } from "@round/db";

export const dynamic = "force-dynamic";

/**
 * For the host's health check: the app is up and can reach the database (503 if not).
 * With ?deep=1 it also reports the job queue and email outbox, for uptime monitoring.
 */
export async function GET(req: Request) {
  try {
    await pool().query("select 1");
  } catch {
    return Response.json({ ok: false, db: false }, { status: 503 });
  }
  if (!new URL(req.url).searchParams.has("deep")) return Response.json({ ok: true });
  const warnings: string[] = [];
  const q = async (text: string) => (await pool().query(text).catch(() => ({ rows: [] as Record<string, unknown>[] }))).rows[0] ?? {};
  const jobs = await q(`select max(completed_on) as last from pgboss.job where name = 'every-minute' and state = 'completed'`);
  const last = jobs.last ? new Date(jobs.last as string) : null;
  if (!last || Date.now() - last.getTime() > 10 * 60_000) warnings.push("Scheduled jobs haven't run in the last 10 minutes");
  const mail = await q(`select count(*) filter (where status = 'failed' and created_at > now() - interval '1 day')::int as failed, count(*) filter (where status = 'pending' and created_at < now() - interval '1 hour')::int as stuck from email_outbox`);
  if (Number(mail.failed) > 0) warnings.push(`${mail.failed} emails failed today`);
  if (Number(mail.stuck) > 0) warnings.push(`${mail.stuck} emails waiting over an hour`);
  const errs = await q(`select coalesce(sum(count),0)::int as n from app_error where last_at > now() - interval '1 hour'`);
  if (Number(errs.n) > 20) warnings.push(`${errs.n} server errors in the last hour`);
  return Response.json({ ok: warnings.length === 0, db: true, jobsLastRun: last, warnings });
}
