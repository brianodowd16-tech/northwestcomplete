import { NextResponse } from "next/server";
import { getMarket, marketFromHost } from "@/lib/site";

// myPOS sends the customer here when they cancel on the payment page. Nothing was charged.
function handle(request: Request) {
  return NextResponse.redirect(new URL("/checkout?cancelled=1", getMarket(marketFromHost(request.headers.get("host"))).url), 303);
}

export const GET = handle;
export const POST = handle;
