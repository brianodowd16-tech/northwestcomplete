import { topics } from "@round/db";
import { orderForCustomer, venueBySlug } from "@round/db/services";
import { currentGuest } from "@/lib/server";
import { subscribe } from "@/lib/realtime";

export const dynamic = "force-dynamic";

// Server-sent events. Payloads are only "something changed" pings; clients refetch
// through authorised endpoints, so a venue ping leaks nothing.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const venue = await venueBySlug(url.searchParams.get("venue") ?? "").catch(() => null);
  if (!venue) return new Response("unknown venue", { status: 404 });

  const subs = [topics.venue(venue.id)];
  const orderId = url.searchParams.get("order");
  if (orderId) {
    const guest = await currentGuest();
    if (!guest) return new Response("sign in", { status: 401 });
    await orderForCustomer(venue, orderId, guest.id).catch(() => null).then((o) => {
      if (o) subs.push(topics.order(orderId));
    });
  }

  const enc = new TextEncoder();
  let cleanup: (() => void)[] = [];
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
      cleanup = await Promise.all(subs.map((s) => subscribe(s, send)));
      const ping = setInterval(() => controller.enqueue(enc.encode(": ping\n\n")), 25_000);
      cleanup.push(() => clearInterval(ping));
      req.signal.addEventListener("abort", () => {
        cleanup.forEach((f) => f());
        try {
          controller.close();
        } catch {}
      });
      send({ kind: "hello" });
    },
    cancel() {
      cleanup.forEach((f) => f());
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
