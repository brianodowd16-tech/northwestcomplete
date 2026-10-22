import { hashPassword } from "@round/core";
import { randomBytes } from "node:crypto";
import type { Db } from "./index";
import * as t from "./schema";

// Example data from the prototype. Not real venue figures.

type Item = [name: string, cat: string, priceCents: number, vat: 9 | 23, station: "bar" | "kitchen", alcohol: boolean, venues: ("mjo" | "drum")[]];

const MENU: Item[] = [
  ["Pint of stout", "Pints", 620, 23, "bar", true, ["mjo", "drum"]],
  ["Pint of lager", "Pints", 640, 23, "bar", true, ["mjo", "drum"]],
  ["Pint of craft cider", "Pints", 660, 23, "bar", true, ["drum"]],
  ["Irish whiskey (35.5ml)", "Spirits", 650, 23, "bar", true, ["mjo", "drum"]],
  ["Gin & tonic", "Spirits", 950, 23, "bar", true, ["mjo", "drum"]],
  ["Soft drink", "Soft & hot", 350, 23, "bar", false, ["mjo", "drum"]],
  ["Flat white", "Soft & hot", 380, 9, "bar", false, ["mjo", "drum"]],
  ["Beef & stout stew", "Food", 1850, 9, "kitchen", false, ["mjo"]],
  ["Fish & chips", "Food", 1700, 9, "kitchen", false, ["mjo", "drum"]],
  ["Seafood chowder", "Food", 1100, 9, "kitchen", false, ["mjo"]],
  ["Toasted special", "Food", 950, 9, "kitchen", false, ["mjo", "drum"]],
  ["Wood-fired margherita", "Food", 1500, 9, "kitchen", false, ["drum"]],
  ["Campfire s'mores kit", "Food", 600, 9, "kitchen", false, ["drum"]],
];

const CATEGORIES = ["Pints", "Spirits", "Soft & hot", "Food"];

type LevelSeed = [name: string, minEuro: number, birthdayEuro: number, levelupPoints: number, doubles: number];

const VENUES = {
  mjo: {
    tenant: "MJ O'Connor's",
    slug: "mj-oconnors",
    name: "MJ O'Connor's",
    tagline: "Pints, trad and proper food",
    town: "Example town",
    brandColor: "#9C6B1C",
    programme: "The Snug Club",
    levels: [
      ["Regular", 0, 15, 0, 0],
      ["Local", 400, 25, 1500, 0],
      ["Stalwart", 1500, 40, 2500, 12],
      ["Legend", 4000, 75, 4000, 24],
    ] as LevelSeed[],
    staffEmail: "staff@mjoconnors.example",
  },
  drum: {
    tenant: "Drumhierny Woodland Hideaway",
    slug: "drumhierny",
    name: "Drumhierny Woodland Hideaway",
    tagline: "Wood-fired food under the trees",
    town: "Co. Leitrim",
    brandColor: "#2B5A4A",
    programme: "Woodland Club",
    levels: [
      ["Sapling", 0, 15, 0, 0],
      ["Birch", 300, 25, 1200, 0],
      ["Oak", 1200, 40, 2500, 12],
      ["Yew", 3500, 75, 4000, 24],
    ] as LevelSeed[],
    staffEmail: "staff@drumhierny.example",
  },
} as const;

export const DEMO_STAFF_PASSWORD = "round-demo";

export async function seed(db: Db) {
  const out: Record<string, { slug: string; tables: string[] }> = {};
  for (const [key, v] of Object.entries(VENUES) as [keyof typeof VENUES, (typeof VENUES)[keyof typeof VENUES]][]) {
    const [ten] = await db.insert(t.tenant).values({ name: v.tenant }).returning();
    const tenantId = ten.id;
    const [prog] = await db
      .insert(t.programme)
      .values({ tenantId, name: v.programme, pointsPerEuro: 10, pointsPerCreditEuro: 100, signupCreditCents: 1000, referralPoints: 500 })
      .returning();
    await db.insert(t.programmeLevel).values(
      v.levels.map(([name, min, bday, pts, doubles]) => ({
        tenantId,
        programmeId: prog.id,
        name,
        minSpend12mCents: min * 100,
        birthdayCreditCents: bday * 100,
        levelupPoints: pts,
        doublePointsCount: doubles,
      })),
    );
    const [ven] = await db
      .insert(t.venue)
      .values({ tenantId, programmeId: prog.id, slug: v.slug, name: v.name, tagline: v.tagline, town: v.town, brandColor: v.brandColor, vatNumber: "IE0000000X" })
      .returning();
    await db.insert(t.subscription).values({ tenantId, venueId: ven.id, monthlyFeeCents: 9900, appFeeBps: 100 });
    const tables = await db
      .insert(t.venueTable)
      .values(Array.from({ length: 20 }, (_, i) => ({ tenantId, venueId: ven.id, number: i + 1, qrToken: randomBytes(6).toString("base64url") })))
      .returning();
    const cats = await db
      .insert(t.menuCategory)
      .values(CATEGORIES.map((name, sort) => ({ tenantId, venueId: ven.id, name, sort })))
      .returning();
    const catId = new Map(cats.map((c) => [c.name, c.id]));
    await db.insert(t.menuItem).values(
      MENU.filter((m) => m[6].includes(key)).map(([name, cat, priceCents, vatRate, station, containsAlcohol], sort) => ({
        tenantId,
        venueId: ven.id,
        categoryId: catId.get(cat)!,
        name,
        priceCents,
        vatRate,
        station,
        containsAlcohol,
        availableForCollect: station === "bar",
        sort,
      })),
    );
    await db.insert(t.staffUser).values({
      tenantId,
      venueId: ven.id,
      email: v.staffEmail,
      name: "Demo staff",
      role: "admin",
      passwordHash: hashPassword(DEMO_STAFF_PASSWORD),
    });
    out[v.slug] = { slug: v.slug, tables: tables.sort((a, b) => a.number - b.number).map((x) => x.qrToken) };
  }
  return out;
}
