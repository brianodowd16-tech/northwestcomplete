import { requestSignupCode } from "@round/db/onboarding";
import { allow, clientIp } from "@/lib/ratelimit";
import { errorJson, json, sessionSecret } from "@/lib/server";

/** Step 1 of business sign-up: email a 6-digit code. */
export async function POST(req: Request) {
  try {
    if (!allow(`code:${await clientIp()}`, 5, 15 * 60_000)) return json({ error: "Too many attempts. Try again in a few minutes." }, 429);
    const { email } = (await req.json()) as { email?: string };
    const { email: clean, code } = await requestSignupCode(email ?? "", sessionSecret());
    // TODO before launch: send the code by email (e.g. Postmark or Amazon SES, EU region). Until then it's shown in dev only.
    return json({ email: clean, devCode: process.env.NODE_ENV === "production" ? undefined : code });
  } catch (e) {
    return errorJson(e);
  }
}
