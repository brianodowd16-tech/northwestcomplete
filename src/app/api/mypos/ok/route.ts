import { NextResponse } from "next/server";
import { getMyposConfig, verifyCallback } from "@/lib/mypos";
import { getMarket, marketFromHost } from "@/lib/site";

// myPOS sends the customer back here after paying (GET or POST). Payment is only
// confirmed by the notify callback; this just shows the thank-you page.
async function handle(request: Request) {
  const url = new URL(request.url);
  let entries: [string, string][] = Array.from(url.searchParams.entries());
  if (request.method === "POST") {
    const form = await request.formData().catch(() => null);
    if (form) entries = Array.from(form.entries()).map(([k, v]): [string, string] => [k, String(v)]);
  }
  const cfg = getMyposConfig();
  const data = cfg ? verifyCallback(cfg, entries) : null;
  const order = data?.orderid ?? "";
  const target = new URL("/checkout/success", getMarket(marketFromHost(request.headers.get("host"))).url);
  if (order) target.searchParams.set("order", order);
  return NextResponse.redirect(target, 303);
}

export const GET = handle;
export const POST = handle;
