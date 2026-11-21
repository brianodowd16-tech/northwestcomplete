import { NextResponse } from "next/server";
import { AssistantRequest, askAssistant, assistantEnabled } from "@/lib/assistant";
import { clientKey, rateLimit } from "@/lib/ratelimit";

export const maxDuration = 60;

export function GET() {
  return NextResponse.json({ enabled: assistantEnabled() });
}

export async function POST(request: Request) {
  if (!rateLimit(`assistant:${clientKey(request)}`, 20, 10 * 60_000)) {
    return NextResponse.json({ error: "You've asked a lot of questions in a short time. Please try again in a few minutes." }, { status: 429 });
  }
  const parsed = AssistantRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please keep questions under 1,500 characters." }, { status: 400 });
  try {
    const result = await askAssistant(parsed.data);
    return "reply" in result ? NextResponse.json(result) : NextResponse.json({ error: result.error }, { status: result.status });
  } catch (err) {
    console.error("[assistant]", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
