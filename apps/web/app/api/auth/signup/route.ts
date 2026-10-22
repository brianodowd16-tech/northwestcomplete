import { verifySession } from "@round/core";
import { createCustomer } from "@round/db/services";
import { cookies } from "next/headers";
import { errorJson, json, sessionSecret, startGuestSession } from "@/lib/server";

export async function POST(req: Request) {
  try {
    const jar = await cookies();
    const phone = verifySession(jar.get("round_verified_phone")?.value, "phone", sessionSecret());
    if (!phone) return json({ error: "Verify your phone number first" }, 400);
    const body = (await req.json()) as { name?: string; email?: string; dateOfBirth?: string; marketingConsent?: boolean };
    const c = await createCustomer({
      phone,
      name: body.name ?? "",
      email: body.email ?? "",
      dateOfBirth: body.dateOfBirth ?? "",
      marketingConsent: body.marketingConsent === true,
    });
    jar.delete("round_verified_phone");
    await startGuestSession(c.id);
    return json({ status: "signed_in" });
  } catch (e) {
    return errorJson(e);
  }
}
