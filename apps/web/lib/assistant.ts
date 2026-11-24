import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// The venue's "Ask your data" assistant: one Claude request per question, answered only
// from a snapshot of the venue's own numbers (see venueSnapshot). No tools, no agent loop.

const SYSTEM = `You are the back-office assistant for a bar or restaurant using Complete (table ordering, payments and loyalty).
Answer the manager's question using only the JSON snapshot in the message. Amounts in the snapshot are euro cents with VAT included; write them as euros (e.g. €12.40).
If the snapshot doesn't contain what's needed, say what's missing instead of guessing. Keep answers short and practical: a direct answer first, then at most three bullet points of supporting numbers or a suggestion.
Never invent figures, guests or trends. Counter sales on the venue's till are not in the data.`;

export function assistantConfigured() {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export type AssistantReply = { ok: true; answer: string } | { ok: false; error: string };

export async function askVenueAssistant(question: string, snapshot: unknown, client = new Anthropic()): Promise<AssistantReply> {
  const q = question.trim().slice(0, 1000);
  if (!q) return { ok: false, error: "Ask a question first" };
  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      output_config: { effort: "low" }, // short Q&A over a small snapshot
      // If a safety classifier declines, retry on a suitable model instead of failing.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      messages: [{ role: "user", content: `<snapshot>\n${JSON.stringify(snapshot)}\n</snapshot>\n\nQuestion: ${q}` }],
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
