import { parseFields } from "@/lib/mypos";
import { handleNotify } from "@/lib/payments";

/** Server-to-server payment confirmation from myPOS (URL_Notify). */
export async function POST(request: Request) {
  const fields = parseFields(await request.text());
  try {
    const result = await handleNotify(fields);
    console.info(`[mypos notify] ${result.log}`);
    return new Response(result.body, { status: result.status, headers: { "Content-Type": "text/plain" } });
  } catch (err) {
    // Woo unreachable etc. A non-OK reply makes myPOS cancel instead of
    // leaving a paid order we never recorded.
    console.error("[mypos notify] failed", err);
    return new Response("ERROR", { status: 500, headers: { "Content-Type": "text/plain" } });
  }
}
