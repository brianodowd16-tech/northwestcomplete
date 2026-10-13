import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";

const TYPES: Record<string, string> = {
  general: "General enquiry",
  quote: "Service quote request",
  "engine-sourcing": "Engine sourcing request",
  "sell-boat": "Sell my boat",
  "boat-viewing": "Boat viewing / enquiry",
};

const MAX = 4000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let data: Record<string, unknown>;
  try {
    data = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // Honeypot field — real visitors never see or fill it.
  if (typeof data.website === "string" && data.website.trim() !== "") {
    return NextResponse.json({ ok: true });
  }

  const str = (key: string) => (typeof data[key] === "string" ? (data[key] as string).trim().slice(0, MAX) : "");
  const type = TYPES[str("type")] ? str("type") : "general";
  const name = str("name");
  const email = str("email");
  const message = str("message");

  if (!name || !EMAIL_RE.test(email) || !message) {
    return NextResponse.json({ error: "Please provide your name, a valid email and a message." }, { status: 400 });
  }

  const skip = new Set(["type", "name", "email", "message", "website"]);
  const extras = Object.keys(data)
    .filter((k) => !skip.has(k) && typeof data[k] === "string" && (data[k] as string).trim())
    .slice(0, 20)
    .map((k) => `${k}: ${str(k)}`);

  const result = await sendEmail({
    subject: `${TYPES[type]} — ${name}`,
    replyTo: email,
    text: [`Type: ${TYPES[type]}`, `Name: ${name}`, `Email: ${email}`, ...extras, "", message].join("\n"),
  });

  if (!result.ok) {
    return NextResponse.json({ error: "Sorry, we couldn't send your message. Please email us directly." }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
