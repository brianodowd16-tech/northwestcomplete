import "server-only";
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

export async function sendSignupCode(to: string, code: string) {
  await smtp().sendMail({
    from: from(),
    to,
    subject: `${code} is your Complete code`,
    text: `Your code to set up your venue on Complete is ${code}.\n\nIt works for 15 minutes. If you didn't ask for it, you can ignore this email.\n\nComplete · complete.pub`,
    html: `<div style="font-family:system-ui,sans-serif;font-size:15px;color:#17201D"><p>Your code to set up your venue on Complete is</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p><p style="color:#5B6863">It works for 15 minutes. If you didn't ask for it, you can ignore this email.</p><p style="color:#5B6863">Complete · complete.pub</p></div>`,
  });
}

/** Any plain email from the Complete mailbox (supplier orders and similar). */
export async function sendEmail(to: string, subject: string, text: string, replyTo?: string, attachments?: { filename: string; content: string; contentType: string }[]) {
  await smtp().sendMail({ from: from(), to, subject, text, ...(replyTo ? { replyTo } : {}), ...(attachments ? { attachments } : {}) });
}
