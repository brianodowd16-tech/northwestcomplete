import "server-only";
import { AgentAuthError, authenticateAgent } from "@round/db/ai";

/** Bearer token from an Authorization header. */
export function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : null;
}

export async function agentFromRequest(req: Request) {
  try {
    return await authenticateAgent(bearer(req));
  } catch (e) {
    if (e instanceof AgentAuthError) return null;
    throw e;
  }
}

export const unauthorised = () =>
  new Response(JSON.stringify({ error: "Connect this assistant from the venue's app (Rewards → AI assistants) and use the token it shows." }), {
    status: 401,
    headers: { "Content-Type": "application/json", "WWW-Authenticate": 'Bearer realm="Complete"' },
  });
