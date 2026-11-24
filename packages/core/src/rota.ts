// Rota and payroll rules for Irish venues (Organisation of Working Time Act 1997; Payment of Wages
// (Amendment) (Tips and Gratuities) Act 2022). Guidance for managers, not legal advice.

export interface PlannedShift {
  id?: string;
  staffId: string;
  name: string;
  startsAt: Date;
  endsAt: Date;
}

const H = 3_600_000;

/**
 * Warnings for a rota: overlapping shifts, less than 11 hours' rest between shifts, more than 48 hours
 * in the week, long shifts (breaks due), shifts on a day the person said they can't work.
 */
export function rotaChecks(shifts: PlannedShift[], unavailable: { staffId: string; date: string }[], tz: string) {
  const out: { staffId: string; name: string; level: "warn" | "info"; text: string }[] = [];
  const day = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: tz });
  const by = new Map<string, PlannedShift[]>();
  for (const s of shifts) by.set(s.staffId, [...(by.get(s.staffId) ?? []), s]);
  for (const [staffId, list] of by) {
    const ss = [...list].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    const name = ss[0].name;
    let total = 0;
    ss.forEach((s, i) => {
      const hours = (s.endsAt.getTime() - s.startsAt.getTime()) / H;
      total += hours;
      if (hours > 6) out.push({ staffId, name, level: "info", text: `${day(s.startsAt)}: ${hours.toFixed(1)}h shift needs a 30-minute break` });
      else if (hours > 4.5) out.push({ staffId, name, level: "info", text: `${day(s.startsAt)}: ${hours.toFixed(1)}h shift needs a 15-minute break` });
      if (unavailable.some((u) => u.staffId === staffId && u.date === day(s.startsAt))) out.push({ staffId, name, level: "warn", text: `${day(s.startsAt)}: said they can't work this day` });
      const next = ss[i + 1];
      if (!next) return;
      const gap = (next.startsAt.getTime() - s.endsAt.getTime()) / H;
      if (gap < 0) out.push({ staffId, name, level: "warn", text: `${day(s.startsAt)}: shifts overlap` });
      else if (gap < 11) out.push({ staffId, name, level: "warn", text: `${day(next.startsAt)}: only ${gap.toFixed(1)}h rest since the last shift (11h required)` });
    });
    if (total > 48) out.push({ staffId, name, level: "warn", text: `${total.toFixed(1)} hours this week (the average must stay at or under 48)` });
  }
  return out;
}

/** Splits tips fairly by hours worked (largest remainder, so the cents add up exactly). */
export function shareTips(tipsCents: number, minutesByStaff: Map<string, number>): Map<string, number> {
  const total = [...minutesByStaff.values()].reduce((a, b) => a + b, 0);
  const out = new Map<string, number>();
  if (!total || tipsCents <= 0) {
    for (const k of minutesByStaff.keys()) out.set(k, 0);
    return out;
  }
  const raw = [...minutesByStaff].map(([k, m]) => [k, (tipsCents * m) / total] as const);
  let left = tipsCents;
  raw.forEach(([k, v]) => {
    out.set(k, Math.floor(v));
    left -= Math.floor(v);
  });
  raw.sort((a, b) => (b[1] % 1) - (a[1] % 1)).forEach(([k]) => {
    if (left > 0) {
      out.set(k, out.get(k)! + 1);
      left--;
    }
  });
  return out;
}

export interface WorkedShift {
  staffId: string;
  name: string;
  email: string;
  payrollRef: string;
  clockIn: Date;
  clockOut: Date | null;
  hourlyRateCents: number;
}

/**
 * Payroll for a period from clock-ins: hours to the quarter hour, Sunday hours with the venue's Sunday
 * premium, gross pay, and each person's share of the period's tips.
 */
export function payrollPeriod(shifts: WorkedShift[], opts: { until: Date; tz: string; sundayPremiumPct: number; tipsCents: number }) {
  const rows = new Map<string, { staffId: string; name: string; email: string; payrollRef: string; minutes: number; sundayMinutes: number; grossCents: number; rateCents: number }>();
  for (const s of shifts) {
    const end = s.clockOut ?? opts.until;
    const mins = Math.max(0, Math.round((end.getTime() - s.clockIn.getTime()) / 900_000) * 15);
    const sunday = new Intl.DateTimeFormat("en-GB", { timeZone: opts.tz, weekday: "short" }).format(s.clockIn) === "Sun";
    const pay = Math.round((mins / 60) * s.hourlyRateCents * (sunday ? 1 + opts.sundayPremiumPct / 100 : 1));
    const cur = rows.get(s.staffId) ?? { staffId: s.staffId, name: s.name, email: s.email, payrollRef: s.payrollRef, minutes: 0, sundayMinutes: 0, grossCents: 0, rateCents: s.hourlyRateCents };
    rows.set(s.staffId, { ...cur, minutes: cur.minutes + mins, sundayMinutes: cur.sundayMinutes + (sunday ? mins : 0), grossCents: cur.grossCents + pay, rateCents: s.hourlyRateCents });
  }
  const tips = shareTips(opts.tipsCents, new Map([...rows].map(([k, r]) => [k, r.minutes])));
  return [...rows.values()].map((r) => ({ ...r, hours: r.minutes / 60, sundayHours: r.sundayMinutes / 60, tipsCents: tips.get(r.staffId) ?? 0 })).sort((a, b) => a.name.localeCompare(b.name));
}

export type PayrollFormat = "generic" | "brightpay" | "thesaurus" | "sage";
export const PAYROLL_FORMATS: Record<PayrollFormat, string> = {
  generic: "Spreadsheet (all columns)",
  brightpay: "BrightPay (hours import)",
  thesaurus: "Thesaurus Payroll Manager",
  sage: "Sage Payroll",
};

/** CSV for a payroll package. Column layouts follow each package's hours import; map them once on first import. */
export function payrollCsv(rows: ReturnType<typeof payrollPeriod>, format: PayrollFormat): string {
  const q = (v: string | number) => (typeof v === "number" ? String(v) : `"${String(v).replace(/"/g, '""')}"`);
  const e = (c: number) => (c / 100).toFixed(2);
  const split = (n: string) => { const p = n.trim().split(/\s+/); return { forename: p[0] ?? "", surname: p.slice(1).join(" ") || p[0] || "" }; };
  const table: (string | number)[][] =
    format === "brightpay"
      ? [["Employee ID", "Surname", "Forename", "Hours", "Hourly Rate", "Sunday Hours", "Tips"], ...rows.map((r) => [r.payrollRef, split(r.name).surname, split(r.name).forename, r.hours.toFixed(2), e(r.rateCents), r.sundayHours.toFixed(2), e(r.tipsCents)])]
      : format === "thesaurus"
        ? [["Works Number", "Employee Name", "Normal Hours", "Rate", "Sunday Premium Hours", "Gross Pay", "Tips"], ...rows.map((r) => [r.payrollRef, r.name, r.hours.toFixed(2), e(r.rateCents), r.sundayHours.toFixed(2), e(r.grossCents), e(r.tipsCents)])]
        : format === "sage"
          ? [["Reference", "Forename", "Surname", "Hours Worked", "Rate", "Gross", "Tips"], ...rows.map((r) => [r.payrollRef, split(r.name).forename, split(r.name).surname, r.hours.toFixed(2), e(r.rateCents), e(r.grossCents), e(r.tipsCents)])]
          : [["Payroll ref", "Name", "Email", "Hours", "Sunday hours", "Hourly rate", "Gross pay", "Tips share"], ...rows.map((r) => [r.payrollRef, r.name, r.email, r.hours.toFixed(2), r.sundayHours.toFixed(2), e(r.rateCents), e(r.grossCents), e(r.tipsCents)])];
  return table.map((row) => row.map(q).join(",")).join("\r\n") + "\r\n";
}
