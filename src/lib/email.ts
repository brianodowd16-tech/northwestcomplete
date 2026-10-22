type Email = { subject: string; text: string; replyTo?: string; to?: string };

/**
 * Sends a notification email via Resend's HTTP API. Falls back to logging when
 * RESEND_API_KEY is not configured so the site still works in development.
 */
export async function sendEmail({ subject, text, replyTo, to }: Email) {
  const apiKey = process.env.RESEND_API_KEY;
  const recipient = to ?? process.env.NOTIFY_EMAIL ?? "brian@northwestboatmaintenance.com";
  const from = process.env.FROM_EMAIL ?? "Northwest Boat Maintenance <noreply@northwestboatmaintenance.com>";

  if (!apiKey) {
    console.info(`[email:dev] To: ${recipient}\nSubject: ${subject}\n\n${text}`);
    return { ok: true, delivered: false };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [recipient], subject, text, reply_to: replyTo }),
  });

  if (!res.ok) {
    console.error("[email] send failed", res.status, await res.text());
    return { ok: false, delivered: false };
  }
  return { ok: true, delivered: true };
}
