import { checkPassword, decryptSecret, verifyTotp } from "@round/core";
import { useTotpStep } from "@round/db/passkeys";
import { staffByEmail, venueById } from "@round/db/services";
import { allow, clientIp } from "@/lib/ratelimit";
import { errorJson, json, secretsKey, startStaffSession } from "@/lib/server";

export async function POST(req: Request) {
  try {
    if (!await allow(`login:${await clientIp()}`, 20, 15 * 60_000)) return json({ error: "Too many attempts. Try again in a few minutes." }, 429);
    const { email, password, code } = (await req.json()) as { email?: string; password?: string; code?: string };
    const staff = await staffByEmail(email ?? "");
    if (!staff || !checkPassword(password ?? "", staff.passwordHash)) return json({ error: "Wrong email or password" }, 401);
    // Two-step: with an authenticator app set up, the password alone isn't enough.
    if (staff.totpSecretEnc) {
      const key = secretsKey();
      if (!code) return json({ needsCode: true, error: "Enter the 6-digit code from your authenticator app" }, 401);
      const step = key ? verifyTotp(decryptSecret(staff.totpSecretEnc, key), code, Date.now(), staff.totpLastStep) : null;
      if (step === null) return json({ needsCode: true, error: "That code isn't right. Try the newest one." }, 401);
      await useTotpStep(staff.id, step);
    }
    await startStaffSession(staff.id);
    return json({ slug: (await venueById(staff.venueId)).slug, mustChangePassword: staff.mustChangePassword });
  } catch (e) {
    return errorJson(e);
  }
}
