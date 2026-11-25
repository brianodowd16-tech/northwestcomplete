import { describe, expect, it, vi } from "vitest";
import { bizimplySalesCsv, DeelClient, deelPeriodItems, matchContracts, payrollPeriod, stableUuid, type DeelContract } from "./index";

const rows = payrollPeriod(
  [
    { staffId: "s1", name: "Aoife Byrne", email: "aoife@x.ie", payrollRef: "1", clockIn: new Date("2026-11-22T10:00:00Z"), clockOut: new Date("2026-11-22T18:00:00Z"), hourlyRateCents: 1500 },
    { staffId: "s2", name: "Ciarán Ó Briain", email: "ciaran@x.ie", payrollRef: "2", clockIn: new Date("2026-11-18T17:00:00Z"), clockOut: new Date("2026-11-18T21:00:00Z"), hourlyRateCents: 1400 },
    { staffId: "s3", name: "Sean Kelly", email: "sean@x.ie", payrollRef: "3", clockIn: new Date("2026-11-18T17:00:00Z"), clockOut: new Date("2026-11-18T19:00:00Z"), hourlyRateCents: 1300 },
  ],
  { until: new Date("2026-11-23T00:00:00Z"), tz: "Europe/Dublin", sundayPremiumPct: 10, tipsCents: 2800 },
);
const contracts: DeelContract[] = [
  { id: "c-eor", type: "eor", title: "Bar staff", email: "aoife@x.ie", name: "Aoife Byrne", externalId: null },
  { id: "c-hourly", type: "pay_as_you_go_time_based", title: "Relief", email: "other@x.ie", name: "Ciarán", externalId: "s2" },
];
const opts = { venueId: "v1", venueName: "MJ's", start: "2026-11-16", lastDay: "2026-11-22", payCategoryId: "cat-pay", tipsCategoryId: "cat-tips" };

describe("Deel", () => {
  it("matches by manual choice, then external id, then email", () => {
    const m = matchContracts([{ id: "s1", email: "AOIFE@x.ie" }, { id: "s2", email: "ciaran@x.ie" }, { id: "s3", email: "sean@x.ie" }], contracts);
    expect(Object.fromEntries(Object.entries(m).map(([k, c]) => [k, c.id]))).toEqual({ s1: "c-eor", s2: "c-hourly" });
    expect(matchContracts([{ id: "s1", email: "aoife@x.ie" }], contracts, { s1: "c-hourly" }).s1.id).toBe("c-hourly");
  });

  it("sends timesheets to hourly contractors and pay plus tips adjustments to payroll staff", () => {
    const { items, unmatched } = deelPeriodItems(rows, matchContracts([{ id: "s1", email: "aoife@x.ie" }, { id: "s2", email: "" }], contracts), opts);
    expect(unmatched).toEqual(["Sean Kelly"]);
    const pay = items.find((i) => i.kind === "adjustment" && i.body.adjustment_category_id === "cat-pay")!;
    expect(pay.body).toMatchObject({ contract_id: "c-eor", amount: "132.00", date_of_adjustment: "2026-11-22" });
    expect(items.find((i) => i.kind === "adjustment" && i.body.adjustment_category_id === "cat-tips")!.body).toMatchObject({ amount: "16.00" });
    const ts = items.find((i) => i.kind === "timesheet")!;
    expect(ts.body).toMatchObject({ data: { contract_id: "c-hourly", quantity: 4, date_submitted: "2026-11-22" } });
    // Keys are UUID-shaped, stable per venue, period and person, and different per item.
    expect(new Set(items.map((i) => i.key)).size).toBe(items.length);
    expect(items.every((i) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(i.key))).toBe(true);
    expect(deelPeriodItems(rows, matchContracts([{ id: "s1", email: "aoife@x.ie" }], contracts), opts).items[0].key).toBe(stableUuid("complete:v1:2026-11-16:s1:pay"));
  });

  it("holds payroll staff back until a pay category is chosen", () => {
    const { items, unmatched } = deelPeriodItems(rows, matchContracts([{ id: "s1", email: "aoife@x.ie" }], contracts), { ...opts, payCategoryId: "" });
    expect(items).toEqual([]);
    expect(unmatched).toEqual(["Aoife Byrne", "Ciarán Ó Briain", "Sean Kelly"]);
  });

  it("sends the idempotency key and backs off on rate limits", async () => {
    let n = 0;
    const seen: { url: string; key: string | undefined }[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      seen.push({ url, key: (init?.headers as Record<string, string>)["Idempotency-Key"] });
      if (n++ === 0) return new Response("slow down", { status: 429 });
      return Response.json({ data: { id: "adj-1" } }, { status: 201 });
    }) as unknown as typeof fetch;
    const c = new DeelClient("tok", "sandbox", fetchImpl, 1);
    const { items } = deelPeriodItems(rows, matchContracts([{ id: "s1", email: "aoife@x.ie" }], contracts), opts);
    expect(await c.send(items[0])).toBe("adj-1");
    expect(seen).toHaveLength(2);
    expect(seen[0].url).toBe("https://api-staging.letsdeel.com/rest/adjustments");
    expect(seen[0].key).toBe(seen[1].key);
  });
});

describe("Bizimply sales file", () => {
  it("writes net ex VAT and gross for the day, with the venue's headings", () => {
    const csv = bizimplySalesCsv("MJ O'Connor's", "2026-11-24", { grossCents: 123000, vatCents: 20000, tipsCents: 900, transactions: 87 });
    expect(csv).toBe(`"Location","Date","Net Sales","Gross Sales","Transactions"\r\n"MJ O'Connor's",24/11/2026,1030.00,1230.00,87\r\n`);
    expect(bizimplySalesCsv("X", "2026-11-24", { grossCents: 0, vatCents: 0, tipsCents: 0, transactions: 0 }, ["Site", "Day", "Net", "Gross", "Count"]).split("\r\n")[0]).toBe(`"Site","Day","Net","Gross","Count"`);
  });
});
