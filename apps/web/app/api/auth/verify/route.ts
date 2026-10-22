import { normalisePhone, signSession } from "@round/core";
import { customerByPhone, verifyOtp } from "@round/db/services";
import { cookies } from "next/headers";
import { errorJson, json, sessionSecret, startGuestSession } from "@/lib/server";

export async function POST(req: Request) {
  try {
    const { phone, code } = (await req.json()) as { phone?: string; code?: string };
    const p = normalisePhone(phone ?? "");
    if (!p || !(await verifyOtp(p, String(code ?? ""), sessionSecret()))) return json({ error: "That code didn't work" }, 400);
    const customer = await customerByPhone(p);
    if (customer) {
      await startGuestSession(customer.id);
      return json({ status: "signed_in" });
    }
    // New guest: remember the verified phone briefly so sign-up can't use an unverified one.
    (await cookies()).set("round_verified_phone", signSession("phone", p, sessionSecret(), 900_000), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 900 });
    return json({ status: "needs_profile" });
  } catch (e) {
    return errorJson(e);
  }
}
