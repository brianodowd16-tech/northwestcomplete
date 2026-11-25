import { NextResponse, type NextRequest } from "next/server";

// The operator console (/ops) is for Complete's own team: HTTP Basic auth against
// OPS_USER / OPS_PASSWORD. Without both set, it doesn't exist.
export function middleware(req: NextRequest) {
  const user = process.env.OPS_USER, pass = process.env.OPS_PASSWORD;
  if (!user || !pass || pass.length < 12) return new NextResponse("Not found", { status: 404 });
  const got = req.headers.get("authorization") ?? "";
  const expected = "Basic " + btoa(`${user}:${pass}`);
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return new NextResponse("Sign in", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Complete ops"' } });
  return NextResponse.next();
}

function timingSafeEqual(a: string, b: string) {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const config = { matcher: ["/ops", "/ops/:path*"] };
