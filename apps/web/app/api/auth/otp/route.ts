import { normalisePhone } from "@round/core";
import { requestOtp } from "@round/db/services";
import { errorJson, json, sessionSecret } from "@/lib/server";

export async function POST(req: Request) {
  try {
    const { phone } = (await req.json()) as { phone?: string };
    const p = normalisePhone(phone ?? "");
    if (!p) return json({ error: "Enter a valid mobile number" }, 400);
    const code = await requestOtp(p, sessionSecret());
    // TODO(SMS): send via an SMS provider. Until then the code is shown in dev only.
    return json({ phone: p, devCode: process.env.NODE_ENV === "production" ? undefined : code });
  } catch (e) {
    return errorJson(e);
  }
}
