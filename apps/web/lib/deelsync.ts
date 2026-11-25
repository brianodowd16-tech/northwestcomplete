import "server-only";
import { DeelClient, deelPeriodItems, lastClosedPeriod, localDate, matchContracts, payrollPeriod, zonedToUtc } from "@round/core";
import { deelSettings, recordSync, syncDone } from "@round/db/integrations";
import { payrollData } from "@round/db/rota";
import type { Venue } from "@round/db/services";
import { secretsKey } from "./server";

export type DeelSendResult = { result: "sent" | "already" | "nothing" | "not_set_up" | "error"; period?: { start: string; end: string }; sent?: number; unmatched?: string[]; error?: string };

/** Contracts in the venue's Deel account and the matches to staff (for the settings screen). */
export async function deelOverview(venue: Venue, staff: { id: string; email: string }[]) {
  const s = await deelSettings(venue, secretsKey());
  if (!s) return null;
  const client = new DeelClient(s.token, s.config.env);
  const [contracts, categories] = await Promise.all([client.contracts(), client.categories().catch(() => [])]);
  return { contracts, categories, matched: matchContracts(staff, contracts, s.config.manual), config: s.config };
}

/**
 * Sends the venue's last closed pay period to Deel: timesheets for hourly contractors,
 * adjustments for payroll employees. Once per period; per-person idempotency keys make
 * a retry after a partial failure safe.
 */
export async function sendDeel(venue: Venue, opts: { force?: boolean; today?: string; fetchImpl?: typeof fetch } = {}): Promise<DeelSendResult> {
  const s = await deelSettings(venue, secretsKey());
  if (!s) return { result: "not_set_up" };
  const period = lastClosedPeriod(opts.today ?? localDate(new Date(), venue.timezone), s.config.frequency, s.config.anchor);
  if (!opts.force && (await syncDone(venue, "deel", period.start))) return { result: "already", period };
  try {
    const from = zonedToUtc(`${period.start}T00:00`, venue.timezone), to = zonedToUtc(`${period.end}T00:00`, venue.timezone);
    const d = await payrollData(venue, from, to);
    const rows = payrollPeriod(d.shifts, { until: to, tz: venue.timezone, sundayPremiumPct: venue.sundayPremiumPct, tipsCents: d.tipsCents });
    const client = new DeelClient(s.token, s.config.env, opts.fetchImpl);
    const emails = new Map(d.shifts.map((x) => [x.staffId, x.email]));
    const contracts = matchContracts(rows.map((r) => ({ id: r.staffId, email: emails.get(r.staffId) ?? "" })), rows.length ? await client.contracts() : [], s.config.manual);
    const lastDay = new Date(Date.parse(`${period.end}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    const { items, unmatched } = deelPeriodItems(rows, contracts, { venueId: venue.id, venueName: venue.name, start: period.start, lastDay, payCategoryId: s.config.payCategoryId, tipsCategoryId: s.config.tipsCategoryId });
    if (!items.length) {
      await recordSync(venue, "deel", period.start, unmatched.length ? "error" : "nothing", null, unmatched.length ? `Not in Deel: ${unmatched.join(", ")}` : null);
      return unmatched.length ? { result: "error", period, unmatched, error: `Not matched in Deel: ${unmatched.join(", ")}` } : { result: "nothing", period };
    }
    for (const item of items) await client.send(item);
    const note = `${items.length} sent${unmatched.length ? `; not in Deel: ${unmatched.join(", ")}` : ""}`;
    await recordSync(venue, "deel", period.start, "done", note.slice(0, 200), null);
    return { result: "sent", period, sent: items.length, unmatched };
  } catch (e) {
    await recordSync(venue, "deel", period.start, "error", null, String(e).slice(0, 500));
    return { result: "error", period, error: String(e instanceof Error ? e.message : e) };
  }
}
