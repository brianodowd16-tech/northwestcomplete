import { AGENT_TOOLS, runAgentTool } from "@round/db/ai";
import { agentFromRequest, unauthorised } from "@/lib/agent";
import { appUrl } from "@/lib/server";

// MCP server (Streamable HTTP, JSON responses) so AI assistants such as Claude or ChatGPT
// can read a guest's loyalty and act for them within the limits the guest set.

interface Rpc {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

const ok = (id: Rpc["id"], result: unknown) => ({ jsonrpc: "2.0", id, result });
const err = (id: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

export async function GET() {
  return new Response("Use POST for MCP requests", { status: 405, headers: { Allow: "POST" } });
}

export async function POST(req: Request) {
  const auth = await agentFromRequest(req);
  if (!auth) return unauthorised();
  const ctx = auth;
  let body: Rpc | Rpc[];
  try {
    body = await req.json();
  } catch {
    return Response.json(err(null, -32700, "Parse error"), { status: 400 });
  }
  const allowed = AGENT_TOOLS.filter((t) => (ctx.grant.scopes as string[]).includes(t.scope));

  async function handle(m: Rpc) {
    if (!m || m.jsonrpc !== "2.0" || typeof m.method !== "string") return err(m?.id, -32600, "Invalid request");
    if (m.id === undefined) return null; // a notification: nothing to answer
    switch (m.method) {
      case "initialize":
        return ok(m.id, {
          protocolVersion: typeof m.params?.protocolVersion === "string" ? m.params.protocolVersion : "2025-06-18",
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "the-snug-club", version: "1.0.0" },
          instructions: `You're helping ${ctx.customer.name.split(" ")[0]} at ${ctx.venue.name}. Prices are in euro cents, VAT included. Orders you start wait for the guest to approve and pay in the app; share the approve_url with them. Never ask for card details.`,
        });
      case "ping":
        return ok(m.id, {});
      case "tools/list":
        return ok(m.id, { tools: allowed.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) });
      case "tools/call": {
        const name = String(m.params?.name ?? "");
        const args = (m.params?.arguments ?? {}) as Record<string, unknown>;
        const r = await runAgentTool(ctx, name, args, appUrl());
        const payload = r.ok ? r.data : { error: r.error, reasons: r.reasons };
        return ok(m.id, { content: [{ type: "text", text: JSON.stringify(payload) }], structuredContent: payload, isError: !r.ok });
      }
      default:
        return err(m.id, -32601, `Method not found: ${m.method}`);
    }
  }

  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map(handle))).filter(Boolean);
    return out.length ? Response.json(out) : new Response(null, { status: 202 });
  }
  const out = await handle(body);
  return out ? Response.json(out) : new Response(null, { status: 202 });
}
