import { OnboardingError, checkPassword, checkPasswordStrength, hashPassword, normaliseEmail } from "@round/core";
import { and, asc, count, eq, max } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { publish, topics, withTenant } from "./index";
import * as t from "./schema";
import type { Staff, Venue } from "./services";

// Self-serve admin for a venue's managers: menu, tables and QR codes, team.

// ---------------------------------------------------------------- menu

export async function menuAdmin(venue: Venue) {
  return withTenant(venue.tenantId, async (tx) => {
    const cats = await tx.select().from(t.menuCategory).where(eq(t.menuCategory.venueId, venue.id)).orderBy(asc(t.menuCategory.sort), asc(t.menuCategory.name));
    const items = await tx.select().from(t.menuItem).where(eq(t.menuItem.venueId, venue.id)).orderBy(asc(t.menuItem.sort), asc(t.menuItem.name));
    return cats.map((c) => ({ ...c, items: items.filter((i) => i.categoryId === c.id) }));
  });
}

const cleanName = (s: unknown, what: string, maxLen = 80) => {
  const n = String(s ?? "").trim().replace(/\s+/g, " ");
  if (n.length < 1 || n.length > maxLen) throw new OnboardingError(`Enter a ${what} (up to ${maxLen} characters)`);
  return n;
};

export async function saveCategory(venue: Venue, input: { id?: string; name: string }) {
  const name = cleanName(input.name, "section name", 40);
  return withTenant(venue.tenantId, async (tx) => {
    if (input.id) {
      const r = await tx.update(t.menuCategory).set({ name }).where(and(eq(t.menuCategory.id, input.id), eq(t.menuCategory.venueId, venue.id))).returning();
      if (!r.length) throw new OnboardingError("Section not found");
      return r[0];
    }
    const [m] = await tx.select({ s: max(t.menuCategory.sort) }).from(t.menuCategory).where(eq(t.menuCategory.venueId, venue.id));
    const [c] = await tx.insert(t.menuCategory).values({ tenantId: venue.tenantId, venueId: venue.id, name, sort: (m.s ?? -1) + 1 }).returning();
    return c;
  });
}

export async function deleteCategory(venue: Venue, id: string) {
  await withTenant(venue.tenantId, async (tx) => {
    const [n] = await tx.select({ n: count() }).from(t.menuItem).where(eq(t.menuItem.categoryId, id));
    if (n.n > 0) throw new OnboardingError("Move or delete the items in this section first");
    await tx.delete(t.menuCategory).where(and(eq(t.menuCategory.id, id), eq(t.menuCategory.venueId, venue.id)));
  });
}

export interface ItemInput {
  id?: string;
  categoryId: string;
  name: string;
  description?: string;
  priceCents: number;
  vatRate: number;
  station: string;
  containsAlcohol: boolean;
  availableForCollect: boolean;
  active: boolean;
}

/** Adds or edits an item. Food goes to the kitchen and is never collect-at-bar. */
export async function saveItem(venue: Venue, input: ItemInput) {
  const name = cleanName(input.name, "name");
  const description = String(input.description ?? "").trim().slice(0, 300);
  if (!Number.isInteger(input.priceCents) || input.priceCents < 0 || input.priceCents > 1_000_000) throw new OnboardingError("Enter a price");
  if (input.vatRate !== 9 && input.vatRate !== 23) throw new OnboardingError("VAT must be 9% or 23%");
  if (input.station !== "bar" && input.station !== "kitchen") throw new OnboardingError("Choose bar or kitchen");
  const station = input.station as "bar" | "kitchen";
  const values = {
    name,
    description,
    priceCents: input.priceCents,
    vatRate: input.vatRate as 9 | 23,
    station,
    containsAlcohol: !!input.containsAlcohol,
    availableForCollect: station === "bar" && !!input.availableForCollect,
    active: input.active !== false,
    categoryId: input.categoryId,
  };
  const saved = await withTenant(venue.tenantId, async (tx) => {
    const [cat] = await tx.select().from(t.menuCategory).where(and(eq(t.menuCategory.id, input.categoryId), eq(t.menuCategory.venueId, venue.id)));
    if (!cat) throw new OnboardingError("Choose a menu section");
    let row;
    if (input.id) {
      [row] = await tx.update(t.menuItem).set(values).where(and(eq(t.menuItem.id, input.id), eq(t.menuItem.venueId, venue.id))).returning();
      if (!row) throw new OnboardingError("Item not found");
    } else {
      const [m] = await tx.select({ s: max(t.menuItem.sort) }).from(t.menuItem).where(eq(t.menuItem.venueId, venue.id));
      [row] = await tx.insert(t.menuItem).values({ ...values, tenantId: venue.tenantId, venueId: venue.id, sort: (m.s ?? -1) + 1 }).returning();
    }
    await publish(tx, topics.venue(venue.id), { type: "menu" });
    return row;
  });
  return saved;
}

// ---------------------------------------------------------------- tables

/** Sets how many tables are in use. Removing tables only switches them off, so old QR codes say "not in use". */
export async function setTableCount(venue: Venue, n: number) {
  if (!Number.isInteger(n) || n < 0 || n > 200) throw new OnboardingError("Tables must be a whole number from 0 to 200");
  await withTenant(venue.tenantId, async (tx) => {
    const rows = await tx.select().from(t.venueTable).where(eq(t.venueTable.venueId, venue.id));
    const have = new Map(rows.map((r) => [r.number, r]));
    for (const r of rows) {
      const want = r.number <= n;
      if (r.active !== want) await tx.update(t.venueTable).set({ active: want }).where(eq(t.venueTable.id, r.id));
    }
    const add = Array.from({ length: n }, (_, i) => i + 1).filter((num) => !have.has(num));
    if (add.length)
      await tx.insert(t.venueTable).values(add.map((number) => ({ tenantId: venue.tenantId, venueId: venue.id, number, qrToken: randomBytes(6).toString("base64url") })));
  });
}

/** New QR code for one table (if a printed code was copied or misused). The old one stops working. */
export async function newTableCode(venue: Venue, tableId: string) {
  await withTenant(venue.tenantId, async (tx) => {
    const r = await tx.update(t.venueTable).set({ qrToken: randomBytes(6).toString("base64url") }).where(and(eq(t.venueTable.id, tableId), eq(t.venueTable.venueId, venue.id))).returning();
    if (!r.length) throw new OnboardingError("Table not found");
  });
}

// ---------------------------------------------------------------- team

export async function listTeam(venue: Venue) {
  return withTenant(venue.tenantId, (tx) =>
    tx
      .select({ id: t.staffUser.id, name: t.staffUser.name, email: t.staffUser.email, role: t.staffUser.role, mustChangePassword: t.staffUser.mustChangePassword })
      .from(t.staffUser)
      .where(eq(t.staffUser.venueId, venue.id))
      .orderBy(asc(t.staffUser.name)),
  );
}

/** Adds a team member with a one-time password to hand over; they choose their own when they first sign in. */
export async function addTeamMember(venue: Venue, by: Staff, input: { name: string; email: string; role: string }): Promise<{ tempPassword: string }> {
  const name = cleanName(input.name, "name");
  const email = normaliseEmail(input.email);
  if (!email) throw new OnboardingError("Enter a valid email address");
  if (input.role !== "admin" && input.role !== "staff") throw new OnboardingError("Choose a role");
  const tempPassword = randomBytes(9).toString("base64url");
  await withTenant(venue.tenantId, async (tx) => {
    try {
      await tx.insert(t.staffUser).values({ tenantId: venue.tenantId, venueId: venue.id, email, name, role: input.role as "admin" | "staff", passwordHash: hashPassword(tempPassword), mustChangePassword: true });
    } catch (e) {
      if (/unique|duplicate/i.test(String((e as { cause?: Error }).cause?.message ?? e))) throw new OnboardingError("Someone already uses that email");
      throw e;
    }
    await tx.insert(t.auditLog).values({ tenantId: venue.tenantId, actor: `staff:${by.id}`, action: "staff.added", entity: `staff:${email}`, detail: { role: input.role } });
  });
  return { tempPassword };
}

export async function removeTeamMember(venue: Venue, by: Staff, staffId: string) {
  if (staffId === by.id) throw new OnboardingError("You can't remove yourself");
  await withTenant(venue.tenantId, async (tx) => {
    const team = await tx.select().from(t.staffUser).where(eq(t.staffUser.venueId, venue.id));
    const target = team.find((s) => s.id === staffId);
    if (!target) throw new OnboardingError("Not found");
    if (target.role === "admin" && team.filter((s) => s.role === "admin").length <= 1) throw new OnboardingError("Keep at least one manager");
    await tx.delete(t.staffUser).where(eq(t.staffUser.id, staffId));
    await tx.insert(t.auditLog).values({ tenantId: venue.tenantId, actor: `staff:${by.id}`, action: "staff.removed", entity: `staff:${target.email}` });
  });
}

export async function changePassword(staff: Staff, current: string, next: string) {
  if (!checkPassword(current, staff.passwordHash)) throw new OnboardingError("Your current password isn't right");
  checkPasswordStrength(next, [staff.email]);
  if (current === next) throw new OnboardingError("Choose a new password");
  await withTenant(staff.tenantId, (tx) =>
    tx.update(t.staffUser).set({ passwordHash: hashPassword(next), mustChangePassword: false }).where(eq(t.staffUser.id, staff.id)),
  );
}

// ---------------------------------------------------------------- venue details

/** Name, tagline, town, VAT number and brand colour shown to guests and on receipts. */
export async function saveVenueDetails(venue: Venue, input: { name: string; tagline: string; town: string; vatNumber: string; brandColor: string }) {
  const name = cleanName(input.name, "venue name");
  const vat = String(input.vatNumber ?? "").replace(/\s/g, "").toUpperCase();
  if (vat && !/^IE\d[0-9A-Z+*]\d{5}[A-Z]{1,2}$/.test(vat)) throw new OnboardingError("Enter an Irish VAT number like IE1234567T");
  const color = String(input.brandColor ?? "").trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new OnboardingError("Pick a brand colour");
  await withTenant(venue.tenantId, async (tx) => {
    await tx
      .update(t.venue)
      .set({ name, tagline: String(input.tagline ?? "").trim().slice(0, 120), town: String(input.town ?? "").trim().slice(0, 80), vatNumber: vat, brandColor: color })
      .where(eq(t.venue.id, venue.id));
  });
}
