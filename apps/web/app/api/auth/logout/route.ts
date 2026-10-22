import { endSessions } from "@/lib/server";

export async function POST(req: Request) {
  await endSessions();
  return Response.redirect(new URL("/", req.url), 303);
}
