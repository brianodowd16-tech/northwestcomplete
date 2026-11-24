import { PAYROLL_FORMATS, payrollCsv, payrollPeriod, type PayrollFormat } from "@round/core";
import { payrollData } from "@round/db/rota";
import { managerFor } from "@/lib/office";

/** Pay period export for BrightPay, Thesaurus, Sage or a spreadsheet. */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const m = await managerFor((await ctx.params).slug);
  if (m instanceof Response) return m;
  const q = new URL(req.url).searchParams;
  const from = new Date(q.get("from") ?? Date.now() - 7 * 86_400_000);
  const to = new Date(q.get("to") ?? Date.now());
  const format = (q.get("format") ?? "generic") as PayrollFormat;
  if (!(format in PAYROLL_FORMATS) || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return new Response("Bad request", { status: 400 });
  const d = await payrollData(m.venue, from, to);
  const rows = payrollPeriod(d.shifts, { until: new Date(), tz: m.venue.timezone, sundayPremiumPct: m.venue.sundayPremiumPct, tipsCents: d.tipsCents });
  return new Response(payrollCsv(rows, format), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="payroll-${format}-${m.venue.slug}-${from.toISOString().slice(0, 10)}.csv"` },
  });
}
