import { handleWebhook } from "@round/db/services";
import { paymentProvider } from "@/lib/server";

export async function POST(req: Request) {
  const raw = await req.text();
  try {
    const r = await handleWebhook(paymentProvider(), raw, req.headers);
    return new Response(r.body, { status: r.status });
  } catch (e) {
    console.error("webhook failed", e);
    // 500 makes Revolut retry; the stored event keeps the error for inspection.
    return new Response("error", { status: 500 });
  }
}
