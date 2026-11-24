import "server-only";

// Text messages through Twilio's Messages API. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and either
// TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM (a number, or an alphanumeric sender like "Complete").
// In the Twilio console, allow only the countries you serve (Geo permissions) to stop SMS fraud.

export function smsConfigured(): boolean {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && (process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_FROM));
}

export async function sendSms(to: string, body: string): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID!, token = process.env.TWILIO_AUTH_TOKEN!;
  const form = new URLSearchParams({ To: to, Body: body });
  if (process.env.TWILIO_MESSAGING_SERVICE_SID) form.set("MessagingServiceSid", process.env.TWILIO_MESSAGING_SERVICE_SID);
  else form.set("From", process.env.TWILIO_FROM!);
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const d = (await res.json().catch(() => ({}))) as { code?: number; message?: string };
    throw new Error(`Twilio ${res.status}${d.code ? ` (${d.code})` : ""}: ${d.message ?? "send failed"}`);
  }
}
