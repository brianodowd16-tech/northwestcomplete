import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();

vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error { status = 500; }
  class RateLimitError extends APIError { status = 429; }
  class Anthropic {
    static APIError = APIError;
    static RateLimitError = RateLimitError;
    beta = { messages: { create } };
  }
  return { default: Anthropic };
});

const { askAssistant, AssistantRequest } = await import("@/lib/assistant");

beforeEach(() => {
  create.mockReset();
  process.env.ANTHROPIC_API_KEY = "test";
});

describe("askAssistant", () => {
  it("is off without an API key", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(await askAssistant({ messages: [{ role: "user", content: "hi" }] })).toEqual({ error: "The assistant isn't switched on yet.", status: 503 });
  });

  it("sends the knowledge base as a cached system prompt with fallbacks, and returns the text", async () => {
    create.mockResolvedValue({ stop_reason: "end_turn", content: [{ type: "text", text: "About 4 kW." }] });
    const out = await askAssistant({ messages: [{ role: "user", content: "What size stove for 50m3?" }], context: "Room: Medium" });
    expect(out).toEqual({ reply: "About 4 kW." });
    const req = create.mock.calls[0][0];
    expect(req.model).toBe("claude-opus-5-5");
    expect(req.fallbacks).toBe("default");
    expect(req.betas).toContain("server-side-fallback-2026-07-01");
    expect(req.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(req.system[0].text).toContain("knowledge base");
    expect(req.system[0].text).toContain("Registered Gas Installer");
    expect(req.messages[0].content).toContain("[My consultation answers: Room: Medium]");
  });

  it("answers politely on a refusal", async () => {
    create.mockResolvedValue({ stop_reason: "refusal", content: [] });
    const out = await askAssistant({ messages: [{ role: "user", content: "x" }] });
    expect("reply" in out && out.reply).toMatch(/can't help with that/);
  });

  it("validates conversation shape", () => {
    expect(AssistantRequest.safeParse({ messages: [{ role: "assistant", content: "hi" }] }).success).toBe(false);
    expect(AssistantRequest.safeParse({ messages: [{ role: "user", content: "x".repeat(1501) }] }).success).toBe(false);
  });
});
