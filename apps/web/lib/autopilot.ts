import "server-only";
import { formatEur, nudgeEmail, nudgeStage, previousMonth, type Statement } from "@round/core";
import { activeVenues, issueInvoice, liveVenueList, managerEmails, markAlertsNotified, markInvoiceEmailed, pruneData, recordError, setupMissing, syncAlerts, venueHealth, venuesInSetup } from "@round/db/platform";
import type { Venue } from "@round/db/services";
import { sendEmail } from "./mail";
import { appUrl } from "./server";

// The jobs that let Complete run many venues without anyone stepping in.

/** Raises and clears each venue's alerts, and emails managers about new ones (once per alert). */
export async function healthCheck() {
  const venues = (await activeVenues()) as Venue[];
  let raised = 0;
  for (const v of venues) {
    try {
      const fresh = await syncAlerts(v, await venueHealth(v));
      if (!fresh.length) continue;
      raised += fresh.length;
      const to = await managerEmails(v);
      const body = fresh.map((a) => `• ${a.title}\n  ${a.detail}\n  Fix it: ${appUrl()}${a.href}`).join("\n\n");
      for (const email of to)
        await sendEmail(email, fresh.length === 1 ? `${v.name}: ${fresh[0].title}` : `${v.name}: ${fresh.length} things need a look`, `Complete keeps an eye on ${v.name}'s connections. This needs your attention:\n\n${body}\n\nWe'll tell you again only if it comes back after being fixed.\n\nComplete · complete.pub`, undefined, undefined, `alert:${v.id}:${fresh.map((a) => a.key).join(",")}:${new Date().toISOString().slice(0, 10)}`);
      await markAlertsNotified(v, fresh.map((a) => a.key));
    } catch (e) {
      await recordError(e, `health ${v.slug}`);
    }
  }
  return raised;
}

/** Venues still in test mode get a nudge on day 2, 5 and 10 naming what's left (each once). */
export async function onboardingNudges(now = new Date()) {
  let sent = 0;
  for (const { venue, ageDays } of await venuesInSetup(now)) {
    const stage = nudgeStage(ageDays);
    if (!stage) continue;
    try {
      const missing = await setupMissing(venue as Venue);
      const mail = nudgeEmail(venue.name, stage, missing, `${appUrl()}/office/${venue.slug}/setup`);
      for (const email of await managerEmails(venue as Venue)) if (await sendEmail(email, mail.subject, mail.text, process.env.SUPPORT_EMAIL || undefined, undefined, `nudge:${venue.id}:${stage}:${email}`)) sent++;
    } catch (e) {
      await recordError(e, `nudge ${venue.slug}`);
    }
  }
  return sent;
}

function invoiceText(v: Venue, number: string, period: string, s: Statement & { pointsOwedToVenueCents?: number }) {
  const e = (c: number) => formatEur(c);
  const pay = process.env.BILLING_PAY_INSTRUCTIONS || "Payment details are on your account page; reply to this email with any question.";
  return `Invoice ${number} from Complete to ${v.name}${v.vatNumber ? ` (VAT ${v.vatNumber})` : ""} for ${period}.\n\nSubscription: ${e(s.subscriptionCents)}\nApp payments: ${e(s.appGrossCents)} less refunds ${e(s.appRefundsCents)} = ${e(s.netAppCents)}\nApp fee (${(s.appFeeBps / 100).toFixed(2)}%): ${e(s.appFeeCents)}\nTotal before VAT: ${e(s.feesExVatCents)}\nVAT (23%): ${e(s.vatCents)}\nTotal: ${e(s.totalCents)}\n\n${s.pointsOwedToVenueCents ? `Complete Points your guests spent with you: ${e(s.pointsOwedToVenueCents)}. Complete pays you this by bank transfer within 10 days.\n\n` : ""}${pay}\n\nComplete · complete.pub`;
}

/** On the 1st: each live venue's invoice for the month just ended, issued and emailed once. */
export async function monthlyBilling(now = new Date()) {
  const { year, month } = previousMonth(now);
  let issued = 0;
  for (const v of (await liveVenueList()) as Venue[]) {
    try {
      const { invoice } = await issueInvoice(v, year, month);
      if (invoice.emailedAt || invoice.totalCents <= 0) continue;
      const text = invoiceText(v, invoice.number, invoice.period, invoice.statement as Statement);
      for (const email of await managerEmails(v)) await sendEmail(email, `Complete invoice ${invoice.number}: ${formatEur(invoice.totalCents)}`, text, process.env.BILLING_EMAIL || undefined, undefined, `invoice:${invoice.id}:${email}`);
      if (process.env.BILLING_EMAIL) await sendEmail(process.env.BILLING_EMAIL, `Issued ${invoice.number} to ${v.name}`, text, undefined, undefined, `invoice:${invoice.id}:copy`);
      await markInvoiceEmailed(v, invoice.id);
      issued++;
    } catch (e) {
      await recordError(e, `billing ${v.slug}`);
    }
  }
  return issued;
}

export async function retention() {
  return pruneData();
}
