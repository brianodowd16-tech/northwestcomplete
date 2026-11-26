import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// The manager's assistant: a short spoken-style briefing of the day and week, and a
// conversation about the venue's own numbers. Answers come only from a snapshot of the
// venue's data (venueSnapshot + the briefing facts). No tools, no agent loop, no guest data.

const SYSTEM = `You are the manager's assistant for a bar, restaurant, cafe or hotel using Complete (ordering, till, payments, loyalty, rota and stock).
Answer using only the JSON snapshot you're given. Amounts are euro cents with VAT included; write them as euros (e.g. €12.40). Sales include app orders and the venue's own till.
Speak plainly, like a sharp, friendly deputy manager: a direct answer first, then at most three short bullet points of supporting numbers or one practical suggestion.
If the snapshot doesn't contain what's needed, say what's missing instead of guessing. Never invent figures, people or trends. Never give advice that promotes alcohol (Irish law).`;

const BRIEF = `Write the manager's briefing from the facts: 2 to 4 short sentences, warm and plain, as you'd say it walking in the door.
Lead with how today is going against last week, then the week, then anything that needs them (alerts, low stock, bookings). Use only numbers in the facts. No headings, no bullet points, no greeting (the screen already greets them).`;

export function assistantConfigured() {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export type AssistantReply = { ok: true; answer: string } | { ok: false; error: string };

/** One turn of the conversation: the previous turns, then the new question. */
export type ChatTurn = { role: "user" | "assistant"; content: string };

async function ask(system: string, messages: Anthropic.Beta.BetaMessageParam[], client: Anthropic): Promise<AssistantReply> {
  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      output_config: { effort: "low" }, // short answers over a small snapshot
      // If a safety classifier declines, retry on a suitable model instead of failing.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      cache_control: { type: "ephemeral" }, // the snapshot repeats across a conversation's turns
      system,
      messages,
    });
    if (response.stop_reason === "refusal") return { ok: false, error: "The assistant couldn't answer that one. Try rephrasing." };
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return text ? { ok: true, answer: text } : { ok: false, error: "No answer came back. Try again." };
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return { ok: false, error: "The assistant is busy. Try again in a minute." };
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, error: "The assistant's API key isn't valid." };
    if (e instanceof Anthropic.APIError) return { ok: false, error: `The assistant had a problem (${e.status}). Try again.` };
    throw e;
  }
}

/** A conversation about the venue: up to the last 12 turns, ending with the manager's question. */
export async function askVenueAssistant(turns: ChatTurn[] | string, snapshot: unknown, client = new Anthropic()): Promise<AssistantReply> {
  const history = (typeof turns === "string" ? [{ role: "user" as const, content: turns }] : turns)
    .filter((t) => (t.role === "user" || t.role === "assistant") && typeof t.content === "string" && t.content.trim())
    .slice(-12)
    .map((t) => ({ role: t.role, content: t.content.trim().slice(0, 2000) }));
  while (history.length && history[0].role !== "user") history.shift();
  if (!history.length || history[history.length - 1].role !== "user") return { ok: false, error: "Ask a question first" };
  return ask(`${SYSTEM}\n\n<snapshot>\n${JSON.stringify(snapshot)}\n</snapshot>`, history, client);
}

const briefCache = new Map<string, { at: number; text: string }>();

/** The assistant's spoken-style briefing, made at most every 10 minutes per venue. */
export async function briefVenue(venueId: string, facts: unknown, client = new Anthropic()): Promise<AssistantReply> {
  const hit = briefCache.get(venueId);
  if (hit && Date.now() - hit.at < 10 * 60_000) return { ok: true, answer: hit.text };
  const r = await ask(`${SYSTEM}\n\n${BRIEF}`, [{ role: "user", content: `<facts>\n${JSON.stringify(facts)}\n</facts>` }], client);
  if (r.ok) briefCache.set(venueId, { at: Date.now(), text: r.answer });
  return r;
}
