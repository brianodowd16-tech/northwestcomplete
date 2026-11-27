import { handleCompleteWebhook } from "@round/db/membership";
import { completeProvider } from "@/lib/membership";

/** Payment notifications for Complete's own account (memberships and points). Verified; settles once. */
export async function POST(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const name = (await ctx.params).provider;
  const provider = completeProvider();
  if (!provider || provider.name !== name) return new Response("not found", { status: 404 });
  const raw = await req.text();
  try {
    const r = await handleCompleteWebhook(provider, raw, req.headers);
    return new Response(r.status === 200 ? "OK" : "rejected", { status: r.status, headers: { "Content-Type": "text/plain" } });
  } catch (e) {
    console.error("complete webhook", e);
    return new Response("error", { status: 500 });
  }
}
