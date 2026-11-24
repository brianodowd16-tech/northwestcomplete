import { validateSignup } from "@round/core";
import { createBusiness } from "@round/db/onboarding";
import { allow, clientIp } from "@/lib/ratelimit";
import { errorJson, json, sessionSecret, startStaffSession } from "@/lib/server";

/** Step 2: verified email + business details → a venue in test mode, and the owner signed in. */
export async function POST(req: Request) {
  try {
    if (!allow(`signup:${await clientIp()}`, 10, 60 * 60_000)) return json({ error: "Too many attempts. Try again later." }, 429);
    const b = (await req.json()) as Record<string, unknown>;
    if (b.website) return json({ error: "Something went wrong" }, 400); // honeypot: people never fill this in
    const input = validateSignup({
      email: String(b.email ?? ""),
      ownerName: String(b.ownerName ?? ""),
      password: String(b.password ?? ""),
      venueName: String(b.venueName ?? ""),
      kind: String(b.kind ?? ""),
      town: String(b.town ?? ""),
      tables: Number(b.tables),
      exampleMenu: b.exampleMenu === true,
      acceptTerms: b.acceptTerms === true,
    });
    const { venue, staff } = await createBusiness(input, String(b.code ?? ""), sessionSecret());
    await startStaffSession(staff.id);
    return json({ slug: venue.slug });
  } catch (e) {
    return errorJson(e);
  }
}
