import { startConnect } from "@/lib/socialconnect";

export async function GET(req: Request) {
  return startConnect(req, "meta");
}
