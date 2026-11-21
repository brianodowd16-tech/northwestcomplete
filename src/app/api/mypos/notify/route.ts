import { sendEmail } from "@/lib/email";
import { getMyposConfig, openToken, tokenSecret, verifyCallback } from "@/lib/mypos";
import { formatPrice, getMarket, site } from "@/lib/site";

// myPOS posts IPCPurchaseNotify here server-to-server once a payment succeeds.
// It must answer exactly "OK" with HTTP 200, otherwise myPOS treats the payment as failed.
const reply = (body: "OK" | "FAIL", status = 200) => new Response(body, { status, headers: { "Content-Type": "text/plain" } });

export async function POST(request: Request) {
  const cfg = getMyposConfig();
  if (!cfg) return reply("FAIL", 503);

  const form = await request.formData();
  const entries = Array.from(form.entries()).map(([k, v]): [string, string] => [k, String(v)]);
  const data = verifyCallback(cfg, entries);
  if (!data) {
    console.error("[mypos:notify] signature check failed");
    return reply("FAIL", 400);
  }

  // Emails are best-effort: the payment is already taken, so always acknowledge it.
  if (data.ipcmethod === "IPCPurchaseNotify") await notifyPaid(request, data, cfg).catch((err) => console.error("[mypos:notify] email failed", err));

  return reply("OK");
}

async function notifyPaid(request: Request, data: Record<string, string>, cfg: NonNullable<ReturnType<typeof getMyposConfig>>) {
  const market = getMarket(new URL(request.url).searchParams.get("m"));
  {
    const cents = Math.round(Number.parseFloat(data.amount ?? "0") * 100);
    const amount = Number.isFinite(cents) ? formatPrice(cents) : `€${data.amount}`;
    await sendEmail({
      subject: `[${market.name}] PAID: order ${data.orderid} — ${amount}`,
      text: [
        `myPOS has confirmed payment.`,
        "",
        `Order: ${data.orderid}`,
        `Amount: ${amount}`,
        `myPOS reference: ${data.ipc_trnref ?? "-"}`,
        `Time: ${data.requestdatetime ?? "-"}`,
        "",
        `The full order details are in the "Order ${data.orderid} started" email.`,
      ].join("\n"),
    });

    const customer = openToken<{ e: string; n: string }>(new URL(request.url).searchParams.get("c"), tokenSecret(cfg));
    if (customer?.e) {
      await sendEmail({
        to: customer.e,
        replyTo: site.email,
        subject: `Thanks for your order ${data.orderid} — ${market.name}`,
        text: [
          `Hi ${customer.n || "there"},`,
          "",
          `Thanks for your order. We've received your payment of ${amount} (order ${data.orderid}).`,
          "",
          `If you booked a service, ${site.contactName} will be in touch within one working day to arrange a date.`,
          `Shop orders are dispatched within 1–2 working days.`,
          "",
          `Questions? WhatsApp ${site.contactName} on ${site.phone} or reply to this email.`,
          "",
          market.name,
          market.url,
        ].join("\n"),
      });
    }
  }
}
