import "server-only";
import { dueEmails, emailById, markEmailFailed, markEmailSent, queueEmail, recordError, type OutgoingEmail } from "@round/db/platform";
import nodemailer from "nodemailer";

// Outgoing email through the Complete mailbox's SMTP server (Hostinger: smtp.hostinger.com, port 465, SSL).
// Set SMTP_USER / SMTP_PASS in the hosting provider's secret store, never in the repo.

export function mailConfigured(): boolean {
  return !!(process.env.SMTP_USER && process.env.SMTP_PASS);
}

let transport: ReturnType<typeof nodemailer.createTransport> | null = null;
function smtp() {
  const port = Number(process.env.SMTP_PORT || 465);
  transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.hostinger.com",
    port,
    secure: port === 465, // 465 = SSL; 587 = STARTTLS
    requireTLS: port !== 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transport;
}

const from = () => process.env.MAIL_FROM || `Complete <${process.env.SMTP_USER}>`;

/**
 * Sends an email through the outbox: recorded first, sent straight away when the mail
 * server answers, otherwise retried by the email job (1, 5, 15, 60, 240 minutes).
 * Returns false only when an email with the same dedupe key was already sent or queued.
 */
export async function deliver(m: OutgoingEmail): Promise<boolean> {
  const id = await queueEmail(m);
  if (!id) return false;
  if (mailConfigured()) await attempt(id);
  return true;
}

async function attempt(id: string) {
  const m = await emailById(id);
  if (!m || m.status !== "pending") return;
  try {
    await smtp().sendMail({ from: from(), to: m.to, subject: m.subject, text: m.text, ...(m.html ? { html: m.html } : {}), ...(m.replyTo ? { replyTo: m.replyTo } : {}), ...(m.attachments ? { attachments: m.attachments } : {}) });
    await markEmailSent(id);
  } catch (e) {
    await markEmailFailed(id, String(e instanceof Error ? e.message : e));
    await recordError(e, `email ${m.subject.slice(0, 60)}`);
  }
}

/** The email job: retries whatever is due. */
export async function sendDueEmails() {
  if (!mailConfigured()) return 0;
  const due = await dueEmails(50);
  for (const m of due) await attempt(m.id);
  return due.length;
}

export async function sendSignupCode(to: string, code: string) {
  await deliver({
    to,
    subject: `${code} is your Complete code`,
    text: `Your code to set up your venue on Complete is ${code}.\n\nIt works for 15 minutes. If you didn't ask for it, you can ignore this email.\n\nComplete · complete.pub`,
    html: `<div style="font-family:system-ui,sans-serif;font-size:15px;color:#17201D"><p>Your code to set up your venue on Complete is</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p><p style="color:#5B6863">It works for 15 minutes. If you didn't ask for it, you can ignore this email.</p><p style="color:#5B6863">Complete · complete.pub</p></div>`,
  });
}

/** Any plain email from the Complete mailbox (supplier orders and similar). */
export async function sendEmail(to: string, subject: string, text: string, replyTo?: string, attachments?: { filename: string; content: string; contentType: string }[], dedupeKey?: string) {
  return deliver({ to, subject, text, replyTo, attachments, dedupeKey });
}
