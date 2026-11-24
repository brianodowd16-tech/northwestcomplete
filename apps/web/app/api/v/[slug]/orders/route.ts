import { createOrder, tableByToken, venueBySlug } from "@round/db/services";
import { appUrl, currentGuest, errorJson, json, providerFor } from "@/lib/server";

interface Body {
  channel: "table" | "collect";
  qrToken?: string;
  lines: { menuItemId: string; qty: number; note?: string }[];
  useCredit: boolean;
  tipCents?: number;
  useDouble: boolean;
  idempotencyKey: string;
}

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const guest = await currentGuest();
    if (!guest) return json({ error: "Sign in to order" }, 401);
    const venue = await venueBySlug((await ctx.params).slug);
    const b = (await req.json()) as Body;
    if (!Array.isArray(b.lines) || typeof b.idempotencyKey !== "string" || b.idempotencyKey.length < 8) {
      return json({ error: "Bad request" }, 400);
    }
    const channel = b.channel === "collect" ? "collect" : "table";
    const table = channel === "table" ? await tableByToken(venue, b.qrToken ?? "") : null;
    const { order, checkout } = await createOrder(
      {
        venue,
        customer: guest,
        channel,
        tableId: table?.id ?? null,
        lines: b.lines.map((l) => ({ menuItemId: String(l.menuItemId), qty: Number(l.qty), note: typeof l.note === "string" ? l.note : null })),
        tipCents: Number(b.tipCents ?? 0) || 0,
        creditRequestedCents: b.useCredit ? Number.MAX_SAFE_INTEGER : 0,
        useDouble: b.useDouble === true,
        idempotencyKey: `${guest.id}:${b.idempotencyKey}`,
        appUrl: appUrl(),
      },
      await providerFor(venue),
    );
    return json({
      orderId: order.id,
      status: order.status,
      amountCents: order.amountPaidCents,
      checkout: checkout && { ...checkout, mode: process.env.REVOLUT_MODE === "prod" ? "prod" : "sandbox" },
    });
  } catch (e) {
    return errorJson(e);
  }
}
