import { OnboardingError, checkPassword, checkPasswordStrength, cleanAllergens, hashPassword, normaliseEmail } from "@round/core";
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
  allergens?: string[];
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
    allergens: cleanAllergens(input.allergens),
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

// ---------------------------------------------------------------- service settings

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Opening hours per station and weekday (Sunday first). A day with no hours is closed; no hours at all = always open. */
export async function saveHours(venue: Venue, hours: { bar?: ([string, string] | null)[]; kitchen?: ([string, string] | null)[] } | null) {
  if (hours) {
    for (const st of ["bar", "kitchen"] as const) {
      const w = hours[st];
      if (!w) continue;
      if (w.length !== 7) throw new OnboardingError("Give hours for each day of the week");
      for (const d of w) if (d && (!HHMM.test(d[0]) || !HHMM.test(d[1]) || d[0] === d[1])) throw new OnboardingError("Use times like 12:00 and 23:30");
    }
  }
  await withTenant(venue.tenantId, (tx) => tx.update(t.venue).set({ hours }).where(eq(t.venue.id, venue.id)));
}

/** Staff pause a station's app orders (kitchen slammed) for some minutes; 0 resumes. */
export async function pauseStation(staff: Staff, station: "bar" | "kitchen", minutes: number) {
  if (!["bar", "kitchen"].includes(station) || !Number.isInteger(minutes) || minutes < 0 || minutes > 240) throw new OnboardingError("Pause for 0 to 240 minutes");
  await withTenant(staff.tenantId, async (tx) => {
    const [v] = await tx.select().from(t.venue).where(eq(t.venue.id, staff.venueId));
    const p = { ...(v.pausedUntil ?? {}) };
    if (minutes) p[station] = new Date(Date.now() + minutes * 60_000).toISOString();
    else delete p[station];
    await tx.update(t.venue).set({ pausedUntil: p }).where(eq(t.venue.id, staff.venueId));
    await tx.insert(t.auditLog).values({ tenantId: staff.tenantId, actor: `staff:${staff.id}`, action: minutes ? "station_paused" : "station_resumed", entity: `venue:${staff.venueId}`, detail: { station, minutes } });
    await publish(tx, topics.venue(staff.venueId), { kind: "menu" });
  });
}

export async function setTips(venue: Venue, on: boolean) {
  await withTenant(venue.tenantId, (tx) => tx.update(t.venue).set({ tipsEnabled: on }).where(eq(t.venue.id, venue.id)));
}

/**
 * Bulk menu import from a spreadsheet (CSV): section, name, price, vat, station, alcohol, allergens, description.
 * Sections are created as needed; an item with the same name in the same section is updated, not duplicated.
 */
export async function importMenu(venue: Venue, csv: string) {
  const rows = String(csv ?? "").replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (rows.length < 2) throw new OnboardingError("The file has no menu rows");
  const sep = [",", ";", "\t"].sort((a, b) => rows[0].split(b).length - rows[0].split(a).length)[0];
  const cells = (l: string) => {
    const out: string[] = [];
    let cur = "", q = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (q) { if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true;
      else if (ch === sep) { out.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    out.push(cur.trim());
    return out;
  };
  const head = cells(rows[0]).map((h) => h.toLowerCase());
  const col = (...names: string[]) => head.findIndex((h) => names.some((n) => h === n || h.startsWith(n)));
  const ci = { section: col("section", "category"), name: col("name", "item"), price: col("price"), vat: col("vat"), station: col("station", "goes to"), alcohol: col("alcohol"), allergens: col("allergen"), description: col("description") };
  if (ci.name < 0 || ci.price < 0) throw new OnboardingError("The file needs at least 'name' and 'price' columns");
  const errors: string[] = [];
  const parsed: { section: string; input: Omit<ItemInput, "categoryId"> }[] = [];
  rows.slice(1).forEach((r, i) => {
    const c = cells(r);
    const name = c[ci.name] ?? "";
    if (!name) return;
    const price = String(c[ci.price] ?? "").replace("€", "").replace(",", ".").trim();
    if (!/^\d{1,5}(\.\d{1,2})?$/.test(price)) return errors.push(`Row ${i + 2}: price "${c[ci.price] ?? ""}"`);
    const station = /kitchen|food/i.test(c[ci.station] ?? "") ? "kitchen" : "bar";
    const vat = Number(String(c[ci.vat] ?? "").replace("%", "")) === 9 ? 9 : Number(String(c[ci.vat] ?? "").replace("%", "")) === 23 ? 23 : station === "kitchen" ? 9 : 23;
    parsed.push({
      section: (c[ci.section] ?? "").trim() || (station === "kitchen" ? "Food" : "Drinks"),
      input: {
        name,
        description: ci.description >= 0 ? c[ci.description] ?? "" : "",
        priceCents: Math.round(Number(price) * 100),
        vatRate: vat,
        station,
        containsAlcohol: /^(y|yes|true|1)$/i.test(c[ci.alcohol] ?? ""),
        availableForCollect: station === "bar",
        active: true,
        allergens: (c[ci.allergens] ?? "").toLowerCase().split(/[|/;, ]+/).map((a) => (a === "tree nuts" ? "nuts" : a)).filter(Boolean),
      },
    });
  });
  if (errors.length) throw new OnboardingError(`Fix these and import again: ${errors.slice(0, 5).join("; ")}`);
  const existing = await menuAdmin(venue);
  const catId = new Map(existing.map((c) => [c.name.toLowerCase(), c.id]));
  let added = 0, updated = 0;
  for (const p of parsed) {
    let id = catId.get(p.section.toLowerCase());
    if (!id) {
      id = (await saveCategory(venue, { name: p.section })).id;
      catId.set(p.section.toLowerCase(), id);
    }
    const same = existing.find((c) => c.id === id)?.items.find((x) => x.name.toLowerCase() === p.input.name.toLowerCase());
    await saveItem(venue, { ...p.input, categoryId: id, id: same?.id });
    if (same) updated++;
    else added++;
  }
  return { added, updated };
}
