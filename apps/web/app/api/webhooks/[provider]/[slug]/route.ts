import { handleWebhook, venueBySlug } from "@round/db/services";
import { providerFor } from "@/lib/server";

// Payment notifications: /api/webhooks/{mypos|revolut}/{venue}. Each venue's notification is
// verified with that venue's own keys. myPOS expects a plain-text "OK" on success.
export async function POST(req: Request, ctx: { params: Promise<{ provider: string; slug: string }> }) {
  const { provider: name, slug } = await ctx.params;
  const raw = await req.text();
  try {
    const venue = await venueBySlug(slug);
    const provider = await providerFor(venue);
    if (provider.name !== name) return new Response("wrong provider", { status: 404 });
    const r = await handleWebhook(provider, raw, req.headers, venue);
    return new Response(r.body, { status: r.status, headers: { "Content-Type": "text/plain" } });
  } catch (e) {
    console.error("webhook failed", name, slug, e);
    // Non-200 makes the provider retry; the stored event keeps the error for inspection.
    return new Response("error", { status: 500 });
  }
}
