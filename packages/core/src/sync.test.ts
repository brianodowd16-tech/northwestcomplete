import { describe, expect, it, vi } from "vitest";
import { buildDaySummary, buildSageDay, lastClosedPeriod, payrollPeriod, payrollPushBody, SageClient, sageReference, type DaySummaryInput } from "./index";

const input: DaySummaryInput = {
  date: "2026-11-24",
  venueName: "MJ's",
  paid: [{ lines: [{ grossCents: 1200, vatRate: 9 }, { grossCents: 1250, vatRate: 23 }], creditUsedCents: 200, amountPaidCents: 2250 }],
  refunded: [{ lines: [{ grossCents: 625, vatRate: 23 }], creditUsedCents: 0, amountPaidCents: 625 }],
};
const m = { contactId: "c", salesLedgerId: "s", creditLedgerId: "cr", taxRate9Id: "t9", taxRate23Id: "t23", taxRateNoneId: "t0", bankAccountId: "b" };

describe("Sage day posting", () => {
  it("matches the Xero invoice line for line, tax-inclusive", () => {
    const sage = buildSageDay(input, m, "1234abcd-0000")!;
    const xero = buildDaySummary(input, { contactName: "x", salesAccountCode: "200", taxType9: "A", taxType23: "B", creditAccountCode: "200", creditTaxType: "NONE", paymentAccountCode: "090" })!;
    expect(sage.invoice.sales_invoice.invoice_lines.map((l) => l.unit_price)).toEqual(xero.invoice.LineItems.map((l) => l.UnitAmount));
    expect(sage.invoice.sales_invoice.invoice_lines.map((l) => l.tax_rate_id)).toEqual(["t9", "t23", "t0", "t23"]);
    expect(sage.invoice.sales_invoice.invoice_lines.every((l) => l.unit_price_includes_tax)).toBe(true);
    expect(sage.totalCents).toBe(1625);
    expect(sage.paymentCents).toBe(1625);
    expect(sage.invoice.sales_invoice.reference).toBe(sageReference("1234abcd-0000", "2026-11-24"));
    expect(sage.invoice.sales_invoice.reference.length).toBeLessThanOrEqual(25);
  });

  it("only pays what is still outstanding when the invoice is already in Sage", async () => {
    const day = buildSageDay(input, m, "v1")!;
    const posts: string[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") posts.push(url.split("/").pop()!);
      if (url.includes("/sales_invoices?")) return Response.json({ $items: [{ id: "si", reference: day.invoice.sales_invoice.reference }] });
      if (url.endsWith("/sales_invoices/si")) return Response.json({ outstanding_amount: "6.25" });
      return Response.json({ id: "x" });
    }) as unknown as typeof fetch;
    const c = new SageClient({ clientId: "a", clientSecret: "b", redirectUri: "c" }, fetchImpl);
    expect(await c.postDay("tok", "biz", day, m)).toBe("si");
    expect(posts).toEqual(["contact_payments"]);
    const pay = JSON.parse(String((fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls.at(-1)![1].body));
    expect(pay.contact_payment.total_amount).toBe(6.25);
  });
});

describe("pay periods", () => {
  it("finds the last closed week, fortnight and month", () => {
    expect(lastClosedPeriod("2026-11-25", "weekly")).toEqual({ start: "2026-11-16", end: "2026-11-23" });
    expect(lastClosedPeriod("2026-11-23", "weekly")).toEqual({ start: "2026-11-16", end: "2026-11-23" });
    expect(lastClosedPeriod("2026-11-25", "fortnightly", "2026-11-09")).toEqual({ start: "2026-11-09", end: "2026-11-23" });
    expect(lastClosedPeriod("2026-11-25", "fortnightly", "2026-11-16")).toEqual({ start: "2026-11-02", end: "2026-11-16" });
    expect(lastClosedPeriod("2026-11-25", "monthly")).toEqual({ start: "2026-10-01", end: "2026-11-01" });
    expect(lastClosedPeriod("2026-01-03", "monthly")).toEqual({ start: "2025-12-01", end: "2026-01-01" });
  });

  it("pushes names, refs, hours and pay, never emails", () => {
    const rows = payrollPeriod(
      [{ staffId: "s1", name: "Aoife Byrne", email: "a@x.ie", payrollRef: "007", clockIn: new Date("2026-11-22T10:00:00Z"), clockOut: new Date("2026-11-22T18:00:00Z"), hourlyRateCents: 1500 }],
      { until: new Date("2026-11-23T00:00:00Z"), tz: "Europe/Dublin", sundayPremiumPct: 10, tipsCents: 4000 },
    );
    const body = payrollPushBody({ slug: "mj", name: "MJ's" }, { start: "2026-11-16", end: "2026-11-23" }, rows, "brightpay");
    expect(body.period).toEqual({ start: "2026-11-16", end: "2026-11-22" });
    expect(body.employees[0]).toMatchObject({ payrollRef: "007", hours: 8, sundayHours: 8, grossCents: 13200, tipsCents: 4000 });
    expect(JSON.stringify(body)).not.toContain("a@x.ie");
    expect(body.csv.content.split("\r\n")[0]).toContain("Employee ID");
  });
});
