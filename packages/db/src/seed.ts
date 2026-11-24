import { hashPassword, zonedToUtc } from "@round/core";
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
    programme: "MJ's Regulars",
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

// Example stock: [name, category, unit, pack name, pack size, pack price ex VAT (cents), par, opening packs]
type StockSeed = [string, string, "ml" | "g" | "each", string, number, number, number, number];
const STOCK: StockSeed[] = [
  ["Stout keg", "Beer", "ml", "keg", 50_000, 18_000, 60_000, 2],
  ["Lager keg", "Beer", "ml", "keg", 50_000, 17_000, 60_000, 2],
  ["Cider keg", "Beer", "ml", "keg", 30_000, 12_500, 30_000, 1],
  ["Irish whiskey", "Spirits", "ml", "bottle", 700, 2_300, 1_400, 3],
  ["Gin", "Spirits", "ml", "bottle", 700, 2_400, 1_400, 3],
  ["Tonic", "Mixers", "each", "case", 24, 1_440, 24, 2],
  ["Soft drinks", "Mixers", "each", "case", 24, 1_440, 24, 2],
  ["Coffee beans", "Coffee", "g", "bag", 1_000, 2_200, 1_000, 2],
  ["Milk", "Coffee", "ml", "bottle", 2_000, 240, 4_000, 4],
  ["Stew portion", "Kitchen", "each", "batch", 10, 4_500, 10, 2],
  ["Hake fillet", "Kitchen", "each", "box", 10, 3_800, 10, 2],
  ["Chips", "Kitchen", "g", "bag", 10_000, 1_800, 5_000, 1],
  ["Chowder portion", "Kitchen", "each", "batch", 12, 3_600, 12, 1],
  ["Toastie kit", "Kitchen", "each", "pack", 20, 2_600, 10, 1],
  ["Pizza dough", "Kitchen", "each", "pack", 20, 1_200, 10, 1],
  ["Mozzarella", "Kitchen", "g", "kg", 1_000, 950, 1_000, 2],
  ["S'mores kit", "Kitchen", "each", "pack", 20, 2_400, 10, 1],
];
const RECIPES: Record<string, [string, number][]> = {
  "Pint of stout": [["Stout keg", 568]],
  "Pint of lager": [["Lager keg", 568]],
  "Pint of craft cider": [["Cider keg", 568]],
  "Irish whiskey (35.5ml)": [["Irish whiskey", 36]],
  "Gin & tonic": [["Gin", 36], ["Tonic", 1]],
  "Soft drink": [["Soft drinks", 1]],
  "Flat white": [["Coffee beans", 18], ["Milk", 150]],
  "Beef & stout stew": [["Stew portion", 1]],
  "Fish & chips": [["Hake fillet", 1], ["Chips", 250]],
  "Seafood chowder": [["Chowder portion", 1]],
  "Toasted special": [["Toastie kit", 1]],
  "Wood-fired margherita": [["Pizza dough", 1], ["Mozzarella", 125]],
  "Campfire s'mores kit": [["S'mores kit", 1]],
};

async function seedStock(db: Db, tenantId: string, venueId: string, menuIds: Map<string, string>) {
  const [sup] = await db.insert(t.supplier).values({ tenantId, venueId, name: "Example Drinks & Food Ltd", email: "orders@supplier.example" }).returning();
  const items = await db
    .insert(t.stockItem)
    .values(STOCK.map(([name, category, unit, packName, packSize, packCostCents, parLevel]) => ({ tenantId, venueId, name, category, unit, packName, packSize, packCostCents, parLevel, supplierId: sup.id })))
    .returning();
  const byName = new Map(items.map((i) => [i.name, i]));
  const lines = Object.entries(RECIPES).flatMap(([menuName, ls]) => (menuIds.has(menuName) ? ls.map(([stock, qty]) => ({ tenantId, venueId, menuItemId: menuIds.get(menuName)!, stockItemId: byName.get(stock)!.id, qty })) : []));
  if (lines.length) await db.insert(t.recipeLine).values(lines);
  const [d] = await db.insert(t.delivery).values({ tenantId, venueId, supplierId: sup.id, reference: "Opening stock", totalCents: STOCK.reduce((s, x) => s + x[5] * x[7], 0) }).returning();
  await db.insert(t.stockMovement).values(STOCK.map((x) => ({ tenantId, venueId, stockItemId: byName.get(x[0])!.id, kind: "delivery" as const, qty: x[4] * x[7], costCents: x[5] * x[7], refId: d.id })));
}

/** Example "What's on": weekly regulars plus a couple of upcoming one-offs, in Dublin time. */
async function seedEvents(db: Db, tenantId: string, venueId: string, key: string) {
  const day = (offset: number, hhmm: string) => {
    const d = new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
    return zonedToUtc(`${d}T${hhmm}`, "Europe/Dublin");
  };
  const nextDow = (dow: number, hhmm: string) => day((dow - new Date().getUTCDay() + 7) % 7, hhmm);
  const rows =
    key === "mjo"
      ? [
          { kind: "music" as const, title: "Trad session", details: "Bring an instrument or just a thirst.", where: "Front bar", startsAt: nextDow(4, "21:00"), durationMins: 180, repeatWeekly: true },
          { kind: "quiz" as const, title: "Table quiz", details: "Teams of up to 4. Prizes for the winners.", where: "Back lounge", startsAt: nextDow(3, "20:30"), durationMins: 120, repeatWeekly: true, coverCents: 500 },
          { kind: "sport" as const, title: "Ireland v France", details: "Six Nations · Live on the big screen", where: "Big screen", startsAt: day(3, "16:45"), durationMins: 120 },
          { kind: "sport" as const, title: "Premier League: early kick-off", details: "Sound on in the lounge", where: "Lounge", startsAt: nextDow(6, "12:30"), durationMins: 120, repeatWeekly: true },
        ]
      : [
          { kind: "music" as const, title: "Acoustic by the fire", details: "Local singer-songwriters.", where: "Fire pit", startsAt: nextDow(5, "20:00"), durationMins: 150, repeatWeekly: true },
          { kind: "sport" as const, title: "All-Ireland club hurling", details: "Live on the screen in the bar", where: "Bar", startsAt: day(5, "14:00"), durationMins: 120 },
        ];
  await db.insert(t.venueEvent).values(rows.map((r) => ({ ...r, tenantId, venueId })));
}

/** Sample top games for the coming days (the daily feed job replaces these with real fixtures). */
async function seedTopGames(db: Db) {
  const at = (days: number, hhmm: string) => zonedToUtc(`${new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)}T${hhmm}`, "Europe/Dublin");
  const g: [number, string, string, string, string, string][] = [
    [0, "20:00", "UEFA Champions League", "soccer", "Liverpool", "Real Madrid"],
    [0, "20:00", "UEFA Champions League", "soccer", "Arsenal", "Bayern Munich"],
    [1, "19:35", "United Rugby Championship", "rugby", "Ulster", "Glasgow Warriors"],
    [1, "20:00", "English Premier League", "soccer", "Chelsea", "Tottenham"],
    [2, "12:30", "English Premier League", "soccer", "Manchester United", "Liverpool"],
    [2, "15:00", "English Premier League", "soccer", "Manchester City", "Newcastle"],
    [2, "17:30", "United Rugby Championship", "rugby", "Leinster", "Munster"],
    [2, "17:30", "English Premier League", "soccer", "Arsenal", "Everton"],
    [3, "14:00", "English Premier League", "soccer", "Tottenham", "Chelsea"],
    [3, "15:00", "European Rugby Champions Cup", "rugby", "Connacht", "Toulouse"],
    [3, "16:30", "English Premier League", "soccer", "Aston Villa", "Liverpool"],
  ];
  await db.insert(t.sportFixture).values(g.map(([d, hm, league, sport, home, away], i) => ({ externalId: `sample-${i}`, sport, league, home, away, startsAt: at(d, hm), durationMins: 120, score: 60 }))).onConflictDoNothing();
}

export async function seed(db: Db, opts: { stock?: boolean } = {}) {
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
      .values({ tenantId, programmeId: prog.id, slug: v.slug, name: v.name, tagline: v.tagline, town: v.town, brandColor: v.brandColor, vatNumber: "IE0000000X", fplCode: key === "mjo" ? "mjo2627" : null, bookingSeatsPerSlot: key === "mjo" ? 40 : 0, kind: key === "drum" ? "hotel" : "bar" })
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
    const menuRows = await db.insert(t.menuItem).values(
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
    ).returning();
    if (opts.stock !== false) await seedStock(db, tenantId, ven.id, new Map(menuRows.map((m) => [m.name, m.id])));
    await seedEvents(db, tenantId, ven.id, key);
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
  await seedTopGames(db);
  return out;
}
