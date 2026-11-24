import { requestSignupCode } from "@round/db/onboarding";
import { mailConfigured, sendSignupCode } from "@/lib/mail";
import { allow, clientIp } from "@/lib/ratelimit";
import { errorJson, json, sessionSecret } from "@/lib/server";

/** Step 1 of business sign-up: email a 6-digit code. */
export async function POST(req: Request) {
  try {
    if (!allow(`code:${await clientIp()}`, 5, 15 * 60_000)) return json({ error: "Too many attempts. Try again in a few minutes." }, 429);
    const { email } = (await req.json()) as { email?: string };
    const { email: clean, code } = await requestSignupCode(email ?? "", sessionSecret());
    const prod = process.env.NODE_ENV === "production";
    if (mailConfigured()) {
      try {
        await sendSignupCode(clean, code);
      } catch (e) {
        console.error("signup email", e);
        return json({ error: "We couldn't send the email. Check the address and try again." }, 502);
      }
    } else if (prod) {
      console.error("SMTP_USER/SMTP_PASS not set: can't send sign-up codes");
      return json({ error: "Sign-up is unavailable right now. Please try again later." }, 503);
    }
    // In development the code is also shown on screen.
    return json({ email: clean, devCode: prod ? undefined : code });
  } catch (e) {
    return errorJson(e);
  }
}
