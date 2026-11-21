import { NextResponse, type NextRequest } from "next/server";
import { marketFromHost } from "@/lib/site";

// Both sites are served from one app: ie.* is the Irish site, every other host is Malta.
// Pages live under /[market]; the visitor never sees that prefix.
export function middleware(request: NextRequest) {
  const market = marketFromHost(request.headers.get("host"));
  const url = request.nextUrl.clone();
  url.pathname = `/${market}${url.pathname === "/" ? "" : url.pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!api|_next|images|icon.svg|favicon.ico|robots.txt|sitemap.xml).*)"],
};
