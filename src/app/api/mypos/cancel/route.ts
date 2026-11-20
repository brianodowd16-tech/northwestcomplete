import { NextResponse } from "next/server";
import { SITE_URL } from "@/lib/config";

/** URL_Cancel: the shopper backed out of the payment page. Their basket is kept. */
function back() {
  return NextResponse.redirect(`${SITE_URL}/checkout?payment=cancelled`, 303);
}

export const GET = back;
export const POST = back;
