import { checkPassword } from "@round/core";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool, systemDb, withTenant } from "./index";
import * as p from "./platform";
import * as t from "./schema";
import { seed } from "./seed";
import * as svc from "./services";
import { resetDatabase } from "./setup";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://round:round@localhost:5432/round_test";

let mj: svc.Venue;
beforeAll(async () => {
  await seed(await resetDatabase());
  mj = await svc.venueBySlug("mj-oconnors");
});
afterAll(() => pool().end());

describe("shared rate limits", () => {
  it("counts across calls in a window and starts again after it", async () => {
    const t0 = new Date("2026-11-25T10:00:00Z");
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await p.rateAllow("login:1.2.3.4", 3, 60_000, t0));
    expect(results).toEqual([true, true, true, false]);
    expect(await p.rateAllow("login:5.6.7.8", 3, 60_000, t0)).toBe(true);
    expect(await p.rateAllow("login:1.2.3.4", 3, 60_000, new Date(t0.getTime() + 61_000))).toBe(true);
  });
});

describe("email outbox", () => {
  it("sends each dedupe key once and retries with back-off until it gives up", async () => {
    const id = (await p.queueEmail({ to: "a@b.ie", subject: "Invoice", text: "x", dedupeKey: "invoice:1" }))!;
    expect(await p.queueEmail({ to: "a@b.ie", subject: "Invoice", text: "x", dedupeKey: "invoice:1" })).toBeNull();
    expect((await p.dueEmails()).map((e) => e.id)).toContain(id);
    await p.markEmailFailed(id, "ECONNREFUSED");
    expect((await p.dueEmails()).map((e) => e.id)).not.toContain(id); // next try in a minute
    expect((await p.dueEmails(50, new Date(Date.now() + 61_000))).map((e) => e.id)).toContain(id);
    for (let i = 0; i < 5; i++) await p.markEmailFailed(id, "ECONNREFUSED");
    expect(await p.emailById(id)).toMatchObject({ status: "failed", attempts: 6, lastError: "ECONNREFUSED" });
    const ok = (await p.queueEmail({ to: "c@d.ie", subject: "Hi", text: "y" }))!;
    await p.markEmailSent(ok);
    expect(await p.emailById(ok)).toMatchObject({ status: "sent", attempts: 1 });
  });
});

describe("error tracking", () => {
  it("groups the same error and counts it", async () => {
    const boom = () => new Error(`Order 123 failed for venue 00000000-0000-0000-0000-000000000001`);
    await p.recordError(boom(), "api");
    await p.recordError(boom(), "api");
    const errs = await p.recentErrors();
    expect(errs.find((e) => e.message.startsWith("Order 123"))?.count).toBe(2);
  });
});

describe("staff invite and reset links", () => {
  it("sets a password once, before expiry, and older links stop working", async () => {
    const staff = await p.staffForEmail("STAFF@mjoconnors.example");
    expect(staff?.venueSlug).toBe("mj-oconnors");
    const first = await p.createStaffToken(staff!.id, "reset");
    const second = await p.createStaffToken(staff!.id, "reset");
    expect(await p.staffTokenInfo(first)).toBeNull();
    expect(await p.staffTokenInfo(second)).toMatchObject({ purpose: "reset", email: "staff@mjoconnors.example" });
    await expect(p.setPasswordWithToken(second, "short")).rejects.toThrow(/10 characters/);
    expect(await p.setPasswordWithToken(second, "a-much-longer-password")).toBe(staff!.id);
    expect(await p.setPasswordWithToken(second, "another-long-password")).toBeNull();
    const [row] = await systemDb().select().from(t.staffUser).where(eq(t.staffUser.id, staff!.id));
    expect(checkPassword("a-much-longer-password", row.passwordHash)).toBe(true);
    expect(row.mustChangePassword).toBe(false);
    expect(await p.staffForEmail("nobody@nowhere.ie")).toBeNull();
  });
});

describe("venue health alerts", () => {
  it("raises from failed syncs, emails once, clears when fixed and comes back if it recurs", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await withTenant(mj.tenantId, (tx) => tx.insert(t.xeroSync).values({ tenantId: mj.tenantId, venueId: mj.id, target: "sage", businessDate: today, status: "error", error: "401 invalid_grant", attempts: 1 }));
    const specs = await p.venueHealth(mj);
    expect(specs.map((s) => s.key)).toEqual(["sync:sage"]);
    expect((await p.syncAlerts(mj, specs)).map((a) => a.key)).toEqual(["sync:sage"]);
    await p.markAlertsNotified(mj, ["sync:sage"]);
    expect(await p.syncAlerts(mj, specs)).toEqual([]); // already told
    expect((await p.openAlerts(mj)).map((a) => a.title)).toEqual(["Sage sync failed once this week"]);
    expect(await p.syncAlerts(mj, [])).toEqual([]);
    expect(await p.openAlerts(mj)).toEqual([]);
    expect((await p.syncAlerts(mj, specs)).map((a) => a.key)).toEqual(["sync:sage"]); // came back: tell them again
    expect(await p.managerEmails(mj)).toContain("staff@mjoconnors.example");
  });
});

describe("monthly invoices", () => {
  it("issues one invoice per venue per month", async () => {
    const a = await p.issueInvoice(mj, 2026, 10);
    const b = await p.issueInvoice(mj, 2026, 10);
    expect(a.isNew).toBe(true);
    expect(b.isNew).toBe(false);
    expect(b.invoice.id).toBe(a.invoice.id);
    expect(a.invoice.number).toBe("CMP-202610-MJOCONNORS");
    expect(a.invoice.totalCents).toBe((a.invoice.statement as { totalCents: number }).totalCents);
    expect((await p.venueInvoices(mj)).length).toBe(1);
  });
});

describe("data retention and the operator view", () => {
  it("prunes what's no longer needed and keeps the rest", async () => {
    const old = new Date(Date.now() - 100 * 86_400_000);
    await systemDb().insert(t.emailOutbox).values({ to: "old@x.ie", subject: "Old", text: "body", status: "sent", createdAt: old });
    await systemDb().insert(t.rateBucket).values({ key: "old", windowStart: old, hits: 1 });
    const r = await p.pruneData();
    expect(r.rateBuckets).toBeGreaterThanOrEqual(1);
    expect(r.emailBodies).toBe(1);
    const [kept] = await systemDb().select().from(t.emailOutbox).where(eq(t.emailOutbox.to, "old@x.ie"));
    expect(kept).toMatchObject({ subject: "Old", text: "" });
  });

  it("lists every venue with activity, alerts and billing", async () => {
    const o = await p.opsOverview();
    expect(o.venues.map((v) => v.slug).sort()).toEqual(["drumhierny", "mj-oconnors"]);
    expect(o.venues.find((v) => v.slug === "mj-oconnors")?.lastInvoice?.period).toBe("2026-10");
    expect(o.errors.length).toBeGreaterThan(0);
  });
});
