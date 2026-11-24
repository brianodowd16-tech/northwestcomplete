import { brandInsights } from "@round/db/growth";
import { json } from "@/lib/server";

/** For drinks-brand partners (key in BRAND_API_TOKENS): anonymised units sold across opted-in venues, last N days. */
export async function GET(req: Request) {
  const tokens = (process.env.BRAND_API_TOKENS ?? "").split(",").map((s) => s.trim()).filter((s) => s.length >= 24);
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!tokens.length || !tokens.includes(got)) return json({ error: "Unauthorised" }, 401);
  const days = Math.min(90, Math.max(1, Number(new URL(req.url).searchParams.get("days") ?? 30)));
  const rows = await brandInsights(new Date(Date.now() - days * 86_400_000), new Date());
  return json({ days, minVenuesPerRow: 3, items: rows });
}
