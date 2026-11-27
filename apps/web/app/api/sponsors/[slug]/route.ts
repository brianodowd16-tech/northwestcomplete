import { submitLead } from "@round/db/sponsors";
import { allow, clientIp } from "@/lib/ratelimit";
import { currentGuest, errorJson, json } from "@/lib/server";

/** An enquiry for a sponsor (e.g. a Drumhierny wedding). Consent required; 5 an hour per network. */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    if (!(await allow(`lead:${await clientIp()}`, 5, 3_600_000))) return json({ error: "Too many enquiries. Try again later." }, 429);
    const b = (await req.json()) as Record<string, string>;
    const guest = await currentGuest();
    await submitLead((await ctx.params).slug, { name: b.name, email: b.email, phone: b.phone, eventDate: b.eventDate || null, guests: b.guests ? Number(b.guests) : null, message: b.message, consent: b.consent === "on" || b.consent === "true" }, guest?.id ?? null);
    return json({ message: "Thanks! They'll be in touch soon." });
  } catch (e) {
    return errorJson(e);
  }
}
