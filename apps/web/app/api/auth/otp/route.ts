import { normalisePhone } from "@round/core";
import { requestOtp } from "@round/db/services";
import { allow, clientIp } from "@/lib/ratelimit";
import { errorJson, json, sessionSecret } from "@/lib/server";
import { sendSms, smsConfigured } from "@/lib/sms";

export async function POST(req: Request) {
  try {
    const { phone } = (await req.json()) as { phone?: string };
    const p = normalisePhone(phone ?? "");
    if (!p) return json({ error: "Enter a valid mobile number" }, 400);
    // Every text costs money: limit per number and per connection (stops SMS-pumping fraud).
    if (!allow(`otp-phone:${p}`, 3, 15 * 60_000) || !allow(`otp-ip:${await clientIp()}`, 10, 60 * 60_000))
      return json({ error: "Too many codes requested. Wait a few minutes and try again." }, 429);
    const code = await requestOtp(p, sessionSecret());
    const prod = process.env.NODE_ENV === "production";
    if (smsConfigured()) {
      try {
        await sendSms(p, `${code} is your Complete code. It works for 10 minutes. Don't share it with anyone.`);
      } catch (e) {
        console.error("sms", e);
        return json({ error: "We couldn't text that number. Check it and try again." }, 502);
      }
    } else if (prod) {
      console.error("TWILIO_* not set: can't send sign-in codes");
      return json({ error: "Sign-in is unavailable right now. Please try again shortly." }, 503);
    }
    return json({ phone: p, devCode: prod ? undefined : code });
  } catch (e) {
    return errorJson(e);
  }
}
