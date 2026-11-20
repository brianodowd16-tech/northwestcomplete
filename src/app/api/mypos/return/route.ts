import { NextResponse, type NextRequest } from "next/server";
import { SITE_URL } from "@/lib/config";

/**
 * Where myPOS sends the shopper after paying (URL_OK). It can arrive as GET
 * or POST. Payment status comes only from the notify callback, so this just
 * forwards to the order page, which reads the status from WooCommerce.
 */
function forward(request: NextRequest) {
  const order = request.nextUrl.searchParams.get("order") ?? "";
  const key = request.nextUrl.searchParams.get("key") ?? "";
  if (!/^\d+$/.test(order)) return NextResponse.redirect(`${SITE_URL}/`, 303);
  return NextResponse.redirect(`${SITE_URL}/order/${order}?key=${encodeURIComponent(key)}`, 303);
}

export const GET = forward;
export const POST = forward;
