import "server-only";
import { decryptSecret, lastClosedPeriod, localDate, payrollCsv, payrollPeriod, payrollPushBody, signBody, zonedToUtc, PAYROLL_FORMATS } from "@round/core";
import { payrollPeriodDone, payrollSyncConfig, recordSync } from "@round/db/integrations";
import { payrollData } from "@round/db/rota";
import type { Venue } from "@round/db/services";
import { mailConfigured, sendEmail } from "./mail";
import { secretsKey } from "./server";

export type PayrollSendResult = "sent" | "already" | "nothing" | "not_set_up" | "error";

/**
 * Sends a closed pay period to whoever runs the venue's payroll: the import file by
 * email (BrightPay, Thesaurus, Sage 50 and bureaus import it), or a signed JSON push
 * to an https endpoint (payroll software or middleware with an API). Once per period.
 */
export async function sendPayroll(venue: Venue, opts: { force?: boolean; today?: string } = {}): Promise<{ result: PayrollSendResult; period?: { start: string; end: string }; error?: string }> {
  const set = await payrollSyncConfig(venue);
  if (!set) return { result: "not_set_up" };
  const c = set.config;
  const period = lastClosedPeriod(opts.today ?? localDate(new Date(), venue.timezone), c.frequency, c.anchor);
  if (!opts.force && (await payrollPeriodDone(venue, period.start))) return { result: "already", period };
  try {
    const from = zonedToUtc(`${period.start}T00:00`, venue.timezone), to = zonedToUtc(`${period.end}T00:00`, venue.timezone);
    const d = await payrollData(venue, from, to);
    const rows = payrollPeriod(d.shifts, { until: to, tz: venue.timezone, sundayPremiumPct: venue.sundayPremiumPct, tipsCents: d.tipsCents });
    if (!rows.length) {
      await recordSync(venue, "payroll", period.start, "nothing", null, null);
      return { result: "nothing", period };
    }
    const last = new Date(Date.parse(`${period.end}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    if (c.mode === "email") {
      if (!mailConfigured()) throw new Error("Email isn't set up on the server (SMTP)");
      const filename = `payroll-${c.format}-${venue.slug}-${period.start}.csv`;
      const total = rows.reduce((s, r) => s + r.grossCents, 0);
      await sendEmail(
        c.email,
        `${venue.name}: hours for ${period.start} to ${last}`,
        `Hours and pay for ${venue.name}, ${period.start} to ${last}, from staff clock-ins on Complete.\n\n${rows.length} staff · ${rows.reduce((s, r) => s + r.hours, 0).toFixed(2)} hours · gross €${(total / 100).toFixed(2)} · tips to share €${(d.tipsCents / 100).toFixed(2)}\n\nThe attached file is laid out for ${PAYROLL_FORMATS[c.format]}. Import it as hours for the period; staff are matched by payroll reference.\n\nComplete · complete.pub`,
        undefined,
        [{ filename, content: payrollCsv(rows, c.format), contentType: "text/csv" }],
      );
      await recordSync(venue, "payroll", period.start, "done", `email:${c.email}`, null);
    } else {
      const key = secretsKey();
      if (!set.secret || !key) throw new Error("No signing secret: save the payroll connection again");
      const body = JSON.stringify(payrollPushBody(venue, period, rows, c.format));
      const res = await fetch(c.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Complete-Signature": `sha256=${signBody(body, decryptSecret(set.secret, key))}`, "Idempotency-Key": `complete:${venue.id}:${period.start}:payroll` },
        body,
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`Payroll endpoint answered ${res.status}`);
      await recordSync(venue, "payroll", period.start, "done", `push:${new URL(c.url).host}`, null);
    }
    return { result: "sent", period };
  } catch (e) {
    await recordSync(venue, "payroll", period.start, "error", null, String(e).slice(0, 500));
    return { result: "error", period, error: String(e instanceof Error ? e.message : e) };
  }
}
