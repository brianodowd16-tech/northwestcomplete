import { NextResponse } from "next/server";
import { STORE } from "@/lib/config";
import { EnquirySchema, enquiriesEnabled, sendEnquiry } from "@/lib/enquiry";
import { clientKey, rateLimit } from "@/lib/ratelimit";

export async function POST(request: Request) {
  if (!rateLimit(`enquiry:${clientKey(request)}`, 5, 60 * 60_000)) {
    return NextResponse.json({ error: `Too many requests. Please email ${STORE.email} instead.` }, { status: 429 });
  }
  const parsed = EnquirySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please add your name and a valid email address." }, { status: 400 });
  if (parsed.data.company) return NextResponse.json({ ok: true }); // honeypot hit: pretend success
  if (!enquiriesEnabled()) {
    return NextResponse.json({ error: `Online requests aren't switched on yet. Please email ${STORE.email} and we'll be in touch.` }, { status: 503 });
  }
  try {
    await sendEnquiry(parsed.data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[enquiry]", err);
    return NextResponse.json({ error: `We couldn't send your request. Please email ${STORE.email}.` }, { status: 502 });
  }
}
