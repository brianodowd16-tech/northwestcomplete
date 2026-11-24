import { runAgentTool } from "@round/db/ai";
import { agentFromRequest, unauthorised } from "@/lib/agent";
import { appUrl } from "@/lib/server";

/** REST: run one tool. Body is the tool's arguments as JSON. */
export async function POST(req: Request, ctx: { params: Promise<{ name: string }> }) {
  const agent = await agentFromRequest(req);
  if (!agent) return unauthorised();
  const args = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const r = await runAgentTool(agent, (await ctx.params).name, args, appUrl());
  return Response.json(r, { status: r.ok ? 200 : r.error?.startsWith("Unknown tool") ? 404 : 403 });
}
