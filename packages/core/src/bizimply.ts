// Bizimply (rota, time and attendance) has no public API: sales arrive as a daily
// file it collects from an SFTP folder (it checks at 6.30am Irish time). Complete
// writes one row per venue per trading day so Bizimply can show labour cost against
// sales. Column headings follow Bizimply's Sales Import sample file and can be
// changed per venue to match it.

export const BIZIMPLY_DEFAULT_HEADINGS = ["Location", "Date", "Net Sales", "Gross Sales", "Transactions"] as const;

export interface DaySales { grossCents: number; vatCents: number; tipsCents: number; transactions: number }

/** Net = sales ex VAT, after refunds; tips are left out (they are the staff's). */
export function bizimplySalesCsv(location: string, date: string, s: DaySales, headings: readonly string[] = BIZIMPLY_DEFAULT_HEADINGS): string {
  const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const h = headings.length === 5 && headings.every((x) => x.trim()) ? headings : BIZIMPLY_DEFAULT_HEADINGS;
  const [y, m, d] = date.split("-");
  const row = [q(location), `${d}/${m}/${y}`, ((s.grossCents - s.vatCents) / 100).toFixed(2), (s.grossCents / 100).toFixed(2), String(s.transactions)];
  return `${h.map(q).join(",")}\r\n${row.join(",")}\r\n`;
}

export const bizimplyFileName = (slug: string, date: string) => `complete-sales-${slug}-${date}.csv`;
