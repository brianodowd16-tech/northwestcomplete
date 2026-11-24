import { payrollPeriod, rotaChecks } from "@round/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as admin from "./admin";
import * as g from "./growth";
import { pool } from "./index";
import * as rota from "./rota";
import { seed } from "./seed";
import * as svc from "./services";
import { resetDatabase } from "./setup";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://round:round@localhost:5432/round_test";
let mj: svc.Venue, owner: svc.Staff, sean: svc.Staff;
const MON = "2026-11-23", NEXT = "2026-11-30";

beforeAll(async () => {
  await seed(await resetDatabase());
  mj = await svc.venueBySlug("mj-oconnors");
  owner = (await svc.staffByEmail("staff@mjoconnors.example"))!;
  await admin.addTeamMember(mj, owner, { name: "Seán Kelly", email: "sean@mj.example", role: "staff" });
  sean = (await svc.staffByEmail("sean@mj.example"))!;
});
afterAll(() => pool().end());

describe("rota", () => {
  it("plans shifts (including past midnight), checks them, copies and publishes", async () => {
    expect(rota.weekStart("2026-11-26", "Europe/Dublin")).toBe(MON);
    const late = await rota.saveShift(mj, { staffId: sean.id, date: "2026-11-27", start: "18:00", end: "01:30", role: "bar" });
    expect((late.endsAt.getTime() - late.startsAt.getTime()) / 3_600_000).toBe(7.5);
    await rota.saveShift(mj, { staffId: sean.id, date: "2026-11-28", start: "10:00", end: "18:00", role: "bar" });
    await rota.setUnavailable(sean, "2026-11-28", true, "Wedding");
    const w = await rota.weekRota(mj, MON);
    const checks = rotaChecks(w.shifts, w.unavailable, mj.timezone).map((c) => c.text).join(" | ");
    expect(checks).toMatch(/only 8\.5h rest/);
    expect(checks).toMatch(/can't work/);
    await expect(rota.saveShift(mj, { staffId: sean.id, date: "2026-11-29", start: "09:00", end: "09:00", role: "bar" })).rejects.toThrow(/16 hours/);
    expect(await rota.copyWeek(mj, MON, NEXT)).toBe(2);
    expect(await rota.copyWeek(mj, MON, NEXT)).toBe(0); // no duplicates
    expect((await rota.myRota(sean, new Date("2026-11-23T00:00:00Z"), new Date("2026-12-01T00:00:00Z"))).mine).toHaveLength(0); // not published yet
    const told = await rota.publishWeek(mj, MON);
    expect(told[0]).toMatchObject({ email: "sean@mj.example" });
    expect((await rota.myRota(sean, new Date("2026-11-23T00:00:00Z"), new Date("2026-12-01T00:00:00Z"))).mine).toHaveLength(2);
  });
});

describe("payroll", () => {
  it("builds the pay period from clock-ins with Sunday premium and tips", async () => {
    await g.setHourlyRate(mj, sean.id, 1400);
    await rota.setPayrollRef(mj, sean.id, "E042");
    await rota.setSundayPremium(mj, 25);
    sean = (await svc.staffByEmail("sean@mj.example"))!;
    await g.clock(sean, "in");
    await g.clock(sean, "out");
    const d = await rota.payrollData(mj, new Date(Date.now() - 86_400_000), new Date(Date.now() + 60_000));
    const rows = payrollPeriod(d.shifts, { until: new Date(), tz: mj.timezone, sundayPremiumPct: 25, tipsCents: d.tipsCents });
    expect(rows.find((r) => r.name === "Seán Kelly")).toMatchObject({ payrollRef: "E042", rateCents: 1400 });
    await expect(rota.setSundayPremium(mj, 150)).rejects.toThrow();
  });
});
