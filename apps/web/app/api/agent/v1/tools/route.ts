import { AGENT_TOOLS } from "@round/db/ai";
import { agentFromRequest, unauthorised } from "@/lib/agent";

/** REST: the tools this assistant's token may use. */
export async function GET(req: Request) {
  const ctx = await agentFromRequest(req);
  if (!ctx) return unauthorised();
  const scopes = ctx.grant.scopes as string[];
  return Response.json({ venue: ctx.venue.name, tools: AGENT_TOOLS.filter((t) => scopes.includes(t.scope)).map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
}
