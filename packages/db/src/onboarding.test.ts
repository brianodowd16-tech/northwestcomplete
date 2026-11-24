import { validateSignup } from "@round/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as admin from "./admin";
import { pool, systemDb } from "./index";
import * as ob from "./onboarding";
import * as t from "./schema";
import { seed } from "./seed";
import * as svc from "./services";
import { resetDatabase } from "./setup";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://round:round@localhost:5432/round_test";
const SECRET = "test-secret-0123456789";
const input = validateSignup({ email: "owner@corner.example", ownerName: "Áine Byrne", password: "copper-kettle-42", venueName: "The Corner House", kind: "bar", town: "Sligo", tables: 8, exampleMenu: true, acceptTerms: true });

beforeAll(async () => {
  await seed(await resetDatabase());
});
afterAll(() => pool().end());

describe("business sign-up", () => {
  let venue: svc.Venue;
  let owner: svc.Staff;

  it("needs the emailed code, and limits wrong guesses", async () => {
    const { code } = await ob.requestSignupCode("Owner@Corner.example", SECRET);
    await expect(ob.requestSignupCode("owner@corner.example", SECRET)).rejects.toThrow(/Wait a minute/);
    await expect(ob.createBusiness(input, "000000" === code ? "111111" : "000000", SECRET)).rejects.toThrow(/isn't right/);
    const [row] = await systemDb().select().from(t.signupCode);
    expect(row.attempts).toBe(1);
    ({ venue, staff: owner } = await ob.createBusiness(input, code, SECRET));
    expect(venue).toMatchObject({ slug: "the-corner-house", status: "setup", paymentProvider: "mock", kind: "bar" });
    expect(owner.role).toBe("admin");
    await expect(ob.createBusiness(input, code, SECRET)).rejects.toThrow(/expired/); // code is single-use
  });

  it("sets up a working venue in test mode with a free trial", async () => {
    expect(await svc.venueTables(venue)).toHaveLength(8);
    const menu = await svc.menu(venue);
    expect(menu.flatMap((c) => c.items).length).toBeGreaterThan(3);
    const s = await ob.setupStatus(venue);
    expect(s.canGoLive).toBe(false);
    expect(s.missing.join()).toMatch(/myPOS/);
    expect(s.trialEndsAt!.getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);
    const now = new Date();
    const bill = await svc.billingStatement(venue, now.getUTCFullYear(), now.getUTCMonth() + 1);
    expect(bill.totalCents).toBe(0);
  });

  it("gives a second venue with the same name its own address", async () => {
    const other = validateSignup({ ...input, email: "two@corner.example", tables: 0, exampleMenu: false });
    const { code } = await ob.requestSignupCode(other.email, SECRET);
    const { venue: v2 } = await ob.createBusiness(other, code, SECRET);
    expect(v2.slug).toBe("the-corner-house-sligo");
    expect((await svc.menu(v2)).flatMap((c) => c.items)).toHaveLength(0);
    expect(await admin.menuAdmin(v2)).toHaveLength(3); // starter sections, no items
  });

  it("refuses to go live until payments and VAT are set", async () => {
    await expect(ob.goLive(venue, owner)).rejects.toThrow(/Before going live/);
    await systemDb().update(t.venue).set({ vatNumber: "IE1234567T", paymentProvider: "mypos" }).where(eqId(venue.id));
    await systemDb().insert(t.venueIntegration).values({ tenantId: venue.tenantId, venueId: venue.id, kind: "mypos", config: {}, secretEnc: "x" });
    venue = await svc.venueById(venue.id);
    await ob.goLive(venue, owner);
    expect((await svc.venueById(venue.id)).status).toBe("live");
  });

  it("lets the manager edit the menu, food is never collect-at-bar", async () => {
    const [cat] = await admin.menuAdmin(venue);
    const item = await admin.saveItem(venue, { categoryId: cat.id, name: "Chowder", priceCents: 1100, vatRate: 9, station: "kitchen", containsAlcohol: false, availableForCollect: true, active: true });
    expect(item.availableForCollect).toBe(false);
    await expect(admin.saveItem(venue, { ...item, vatRate: 13.5 })).rejects.toThrow(/9% or 23%/);
    await expect(admin.deleteCategory(venue, cat.id)).rejects.toThrow(/Move or delete/);
    // another tenant's category can't be used
    const mj = await svc.venueBySlug("mj-oconnors");
    const [mjCat] = await admin.menuAdmin(mj);
    await expect(admin.saveItem(venue, { ...item, id: undefined, categoryId: mjCat.id })).rejects.toThrow(/Choose a menu section/);
  });

  it("adds and removes tables without breaking old codes", async () => {
    await admin.setTableCount(venue, 3);
    expect(await svc.venueTables(venue)).toHaveLength(3);
    await admin.setTableCount(venue, 10);
    expect(await svc.venueTables(venue)).toHaveLength(10);
  });

  it("invites staff with a one-time password and keeps a manager", async () => {
    const { tempPassword } = await admin.addTeamMember(venue, owner, { name: "Seán", email: "sean@corner.example", role: "staff" });
    expect(tempPassword.length).toBeGreaterThanOrEqual(12);
    await expect(admin.addTeamMember(venue, owner, { name: "X", email: "owner@corner.example", role: "staff" })).rejects.toThrow(/already/);
    const team = await admin.listTeam(venue);
    expect(team).toHaveLength(2);
    const sean = await svc.staffByEmail("sean@corner.example");
    expect(sean!.mustChangePassword).toBe(true);
    await admin.changePassword(sean!, tempPassword, "brass-lantern-77");
    expect((await svc.staffByEmail("sean@corner.example"))!.mustChangePassword).toBe(false);
    await expect(admin.removeTeamMember(venue, owner, owner.id)).rejects.toThrow(/yourself/);
    await admin.removeTeamMember(venue, owner, sean!.id);
    expect(await admin.listTeam(venue)).toHaveLength(1);
  });
});

import { eq } from "drizzle-orm";
const eqId = (id: string) => eq(t.venue.id, id);
