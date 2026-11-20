import { NextResponse } from "next/server";
import { site } from "@/lib/site";

// myPOS sends the customer here when they cancel on the payment page. Nothing was charged.
function handle() {
  return NextResponse.redirect(new URL("/checkout?cancelled=1", site.url), 303);
}

export const GET = handle;
export const POST = handle;
