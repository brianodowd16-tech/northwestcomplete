// Rules for running many venues without anyone at Complete stepping in: email
// retries, onboarding nudges, monthly invoice numbers, and which problems a venue
// is alerted about. Pure functions; the database side is in packages/db/src/platform.ts.

/** Back-off between email attempts: 1, 5, 15, 60, 240 minutes; null after the last one (give up). */
export function retryDelayMs(attempts: number): number | null {
  const mins = [1, 5, 15, 60, 240][attempts - 1];
  return mins === undefined ? null : mins * 60_000;
}

/** Which nudge a venue still in set-up should get, by days since sign-up (each goes once). */
export function nudgeStage(ageDays: number): 2 | 5 | 10 | null {
  return ageDays >= 10 ? 10 : ageDays >= 5 ? 5 : ageDays >= 2 ? 2 : null;
}

export function nudgeEmail(venueName: string, stage: 2 | 5 | 10, missing: string[], setupUrl: string) {
  const next = missing[0] ?? "Go live";
  const intro =
    stage === 2 ? `${venueName} is nearly ready for guests.` : stage === 5 ? `A few steps stand between ${venueName} and your first app order.` : `${venueName} is still in test mode.`;
  return {
    subject: stage === 10 ? `Need a hand going live, ${venueName}?` : `Next step for ${venueName}: ${next}`,
    text: `${intro}\n\nStill to do:\n${missing.map((m) => `• ${m}`).join("\n") || "• Go live"}\n\nPick up where you left off: ${setupUrl}\n\n${stage === 10 ? "Reply to this email and we'll help you finish.\n\n" : ""}Complete · complete.pub`,
  };
}

export const invoicePeriod = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;
export const invoiceNumber = (period: string, venueSlug: string) => `CMP-${period.replace("-", "")}-${venueSlug.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10)}`;

/** The previous calendar month for a date (billing runs on the 1st for the month just ended). */
export function previousMonth(d: Date): { year: number; month: number } {
  const m = d.getUTCMonth(); // 0-based: this month
  return m === 0 ? { year: d.getUTCFullYear() - 1, month: 12 } : { year: d.getUTCFullYear(), month: m };
}

export interface HealthInput {
  slug: string;
  /** failed syncs in the past week by target, with the latest error */
  syncErrors: { target: string; days: number; lastError: string }[];
  xeroUnmapped: boolean;
  sageUnmapped: boolean;
  /** app orders left unpaid for over 30 minutes in the past day */
  stuckPayments: number;
  live: boolean;
}

export interface AlertSpec { key: string; severity: "warn" | "error"; title: string; detail: string; href: string }

const SYNC_NAMES: Record<string, [string, string]> = {
  xero: ["Xero", "settings"],
  sage: ["Sage", "integrations"],
  payroll: ["Payroll", "integrations"],
  deel: ["Deel", "integrations"],
  bizimply: ["Bizimply", "integrations"],
};

/** Everything a venue's managers should be told about right now. Anything not listed is resolved. */
export function venueAlerts(h: HealthInput): AlertSpec[] {
  const out: AlertSpec[] = [];
  const office = (page: string) => `/office/${h.slug}/${page}`;
  for (const e of h.syncErrors) {
    const [name, page] = SYNC_NAMES[e.target] ?? [e.target, "integrations"];
    out.push({ key: `sync:${e.target}`, severity: "error", title: `${name} sync failed ${e.days === 1 ? "once" : `on ${e.days} days`} this week`, detail: e.lastError.slice(0, 300), href: office(page) });
  }
  if (h.xeroUnmapped) out.push({ key: "xero:unmapped", severity: "warn", title: "Xero is connected but not set up", detail: "Choose the accounts and VAT rates so nightly sales can be posted.", href: office("settings") });
  if (h.sageUnmapped) out.push({ key: "sage:unmapped", severity: "warn", title: "Sage is connected but not set up", detail: "Choose the ledgers, VAT rates and bank account so nightly sales can be posted.", href: office("integrations") });
  if (h.live && h.stuckPayments >= 3)
    out.push({ key: "payments:stuck", severity: "error", title: `${h.stuckPayments} app payments didn't complete today`, detail: "Guests paid or tried to, but no confirmation arrived. Check your payment settings (myPOS notify address and keys).", href: office("settings") });
  return out;
}
