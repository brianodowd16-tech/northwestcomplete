import { createStaffToken, staffForEmail } from "@round/db/platform";
import { sendEmail } from "@/lib/mail";
import { allow, clientIp } from "@/lib/ratelimit";
import { appUrl, errorJson, json } from "@/lib/server";

const SAME_ANSWER = { message: "If that email has a Complete account, a link to reset the password is on its way. It works for 30 minutes." };

/** Emails a password reset link. Always gives the same answer, so it can't be used to find accounts. */
export async function POST(req: Request) {
  try {
    const email = String(((await req.json()) as { email?: string }).email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Enter your work email" }, 400);
    if (!(await allow(`forgot-ip:${await clientIp()}`, 10, 60 * 60_000)) || !(await allow(`forgot:${email}`, 3, 60 * 60_000))) return json({ error: "Too many attempts. Try again later." }, 429);
    const staff = await staffForEmail(email);
    if (staff) {
      const token = await createStaffToken(staff.id, "reset");
      await sendEmail(
        staff.email,
        "Reset your Complete password",
        `Hi ${staff.name.split(" ")[0]},\n\nSomeone (hopefully you) asked to reset the password for your ${staff.venueName} account on Complete.\n\nChoose a new password here (the link works for 30 minutes, once):\n${appUrl()}/staff/reset?token=${token}\n\nIf you didn't ask, ignore this email: your password stays the same.\n\nComplete · complete.pub`,
      );
    }
    return json(SAME_ANSWER);
  } catch (e) {
    return errorJson(e);
  }
}
