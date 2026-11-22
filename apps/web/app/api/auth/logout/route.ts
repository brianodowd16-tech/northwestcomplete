import { endSessions } from "@/lib/server";

export async function POST(req: Request) {
  await endSessions();
  const to = new URL(req.url).searchParams.get("to") ?? "/";
  // Only same-site paths, so the redirect can't be pointed elsewhere.
  const safe = to.startsWith("/") && !to.startsWith("//") ? to : "/";
  return Response.redirect(new URL(safe, req.url), 303);
}
