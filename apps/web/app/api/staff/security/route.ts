import { decryptSecret, encryptSecret, newTotpSecret, otpauthUri, signSession, verifySession, verifyTotp } from "@round/core";
import { passkeysFor, removePasskey, setStaffTotp } from "@round/db/passkeys";
import { staffById } from "@round/db/services";
import { cookies } from "next/headers";
import QRCode from "qrcode";
import { allow } from "@/lib/ratelimit";
import { currentStaff, errorJson, json, secretsKey, sessionSecret } from "@/lib/server";

/** A staff member's own sign-in security: passkeys and an authenticator app. */
export async function GET() {
  const staff = await currentStaff();
  if (!staff) return json({ error: "Sign in" }, 401);
  const keys = await passkeysFor("staff", staff.id);
  return json({ passkeys: keys.map((k) => ({ id: k.id, name: k.name, createdAt: k.createdAt, lastUsedAt: k.lastUsedAt })), authenticator: !!staff.totpSecretEnc });
}

export async function POST(req: Request) {
  try {
    const staff = await currentStaff();
    if (!staff) return json({ error: "Sign in" }, 401);
    const b = (await req.json()) as { action?: string; code?: string; id?: string };
    const key = secretsKey();
    if (!(await allow(`security:${staff.id}`, 20, 15 * 60_000))) return json({ error: "Too many attempts. Try again later." }, 429);
    const jar = await cookies();
    switch (b.action) {
      case "totpStart": {
        const secret = newTotpSecret();
        jar.set("round_totp", signSession("totp", secret, sessionSecret(), 10 * 60_000), { httpOnly: true, sameSite: "strict", path: "/", maxAge: 600, secure: process.env.NODE_ENV === "production" });
        const uri = otpauthUri(staff.email, secret);
        return json({ secret, uri, qr: await QRCode.toDataURL(uri, { margin: 1, width: 220 }) });
      }
      case "totpConfirm": {
        if (!key) return json({ error: "SECRETS_KEY isn't set on the server" }, 500);
        const secret = verifySession(jar.get("round_totp")?.value, "totp", sessionSecret());
        if (!secret) return json({ error: "That took too long. Start again." }, 400);
        const step = verifyTotp(secret, String(b.code ?? ""));
        if (step === null) return json({ error: "That code isn't right. Check the time on your phone and try the newest code." }, 400);
        jar.delete("round_totp");
        await setStaffTotp(staff.id, encryptSecret(secret, key), step);
        return json({ message: "Authenticator app is on. You'll be asked for a code after your password." });
      }
      case "totpOff": {
        const fresh = await staffById(staff.id);
        if (!fresh?.totpSecretEnc || !key) return json({ message: "Authenticator app is off" });
        if (verifyTotp(decryptSecret(fresh.totpSecretEnc, key), String(b.code ?? ""), Date.now(), fresh.totpLastStep) === null) return json({ error: "Enter a current code from your authenticator app to turn it off" }, 400);
        await setStaffTotp(staff.id, null, null);
        return json({ message: "Authenticator app is off" });
      }
      case "removePasskey":
        await removePasskey("staff", staff.id, String(b.id ?? ""));
        return json({ message: "Passkey removed" });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return errorJson(e);
  }
}
