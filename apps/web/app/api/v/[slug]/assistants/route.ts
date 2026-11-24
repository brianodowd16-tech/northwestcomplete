import type { AgentScope } from "@round/core";
import { createGrant } from "@round/db/ai";
import { venueBySlug } from "@round/db/services";
import { appUrl, currentGuest, errorJson, json } from "@/lib/server";

/** The guest connects an AI assistant. The token is returned once, here, and never again. */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const guest = await currentGuest();
    if (!guest) return json({ error: "Sign in first" }, 401);
    const venue = await venueBySlug((await ctx.params).slug);
    const b = (await req.json()) as { name?: string; scopes?: AgentScope[]; maxOrderCents?: number; maxCreditCents?: number; days?: number };
    const token = await createGrant(venue, guest.id, {
      name: String(b.name ?? ""),
      scopes: Array.isArray(b.scopes) ? b.scopes : [],
      maxOrderCents: Number(b.maxOrderCents) || 0,
      maxCreditCents: Number(b.maxCreditCents) || 0,
      days: Number(b.days) || 30,
    });
    return json({ token, mcpUrl: `${appUrl()}/api/mcp`, restUrl: `${appUrl()}/api/agent/v1/tools` });
  } catch (e) {
    return errorJson(e);
  }
}
