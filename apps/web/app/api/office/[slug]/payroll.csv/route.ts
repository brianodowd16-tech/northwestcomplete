import { payroll } from "@round/core";
import { shifts } from "@round/db/growth";
import { managerFor } from "@/lib/office";

/** Hours and gross pay per person for a week, as CSV for BrightPay, Sage or any payroll. */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const m = await managerFor((await ctx.params).slug);
  if (m instanceof Response) return m;
  const from = new Date(new URL(req.url).searchParams.get("from") ?? Date.now() - 7 * 86_400_000);
  const to = new Date(from.getTime() + 7 * 86_400_000);
  const rows = payroll(await shifts(m.venue, from, to), new Date());
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const csv = ["Name,Email,Shifts,Hours,Gross pay (EUR)", ...rows.map((r) => [esc(r.name), esc(r.email), r.shifts, r.hours.toFixed(2), (r.grossCents / 100).toFixed(2)].join(","))].join("\r\n");
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="payroll-${m.venue.slug}-${from.toISOString().slice(0, 10)}.csv"` } });
}
