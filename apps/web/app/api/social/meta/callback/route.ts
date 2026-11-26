import { finishConnect } from "@/lib/socialconnect";

export async function GET(req: Request) {
  return finishConnect(req, "meta");
}
