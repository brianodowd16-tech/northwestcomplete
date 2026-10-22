import { MockProvider } from "@round/core";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool, withTenant } from "./index";
import * as t from "./schema";
import { seed } from "./seed";
import * as svc from "./services";
import { resetDatabase } from "./setup";

// Integration tests against a real Postgres (TEST_DATABASE_URL). They wipe that database.
const url = process.env.TEST_DATABASE_URL ?? "postgres://round:round@localhost:5432/round_test";
process.env.DATABASE_URL = url;

const provider = new MockProvider();
let mj: svc.Venue;
let drum: svc.Venue;

beforeAll(async () => {
  const db = await resetDatabase();
  await seed(db);
  mj = await svc.venueBySlug("mj-oconnors");
  drum = await svc.venueBySlug("drumhierny");
});
afterAll(() => pool().end());

async function guest(phone: string, dob = "1990-01-01") {
  return svc.createCustomer({ phone, name: "Aoife Test", email: "a@example.com", dateOfBirth: dob, marketingConsent: false });
}

async function itemId(venue: svc.Venue, name: string) {
  const cats = await svc.menu(venue);
  return cats.flatMap((c) => c.items).find((i) => i.name === name)!.id;
}

async function pay(order: svc.Order) {
  const { rawBody, headers } = provider.simulatePayment(order.providerOrderId!);
  return svc.handleWebhook(provider, rawBody, headers);
}

describe("tenancy", () => {
  it("RLS hides other tenants' rows", async () => {
    const seen = await withTenant(mj.tenantId, (tx) => tx.select().from(t.venue));
    expect(seen.map((v) => v.slug)).toEqual(["mj-oconnors"]);
    const items = await withTenant(mj.tenantId, (tx) => tx.select().from(t.menuItem).where(eq(t.menuItem.venueId, drum.id)));
    expect(items).toHaveLength(0);
  });

  it("RLS blocks writes into another tenant", async () => {
    await expect(
      withTenant(mj.tenantId, (tx) => tx.update(t.menuItem).set({ soldOut: true }).where(eq(t.menuItem.venueId, drum.id)).returning()),
    ).resolves.toHaveLength(0);
    await expect(
      withTenant(mj.tenantId, (tx) => tx.insert(t.menuCategory).values({ tenantId: drum.tenantId, venueId: drum.id, name: "x" })),
    ).rejects.toMatchObject({ cause: { message: expect.stringMatching(/row-level security/) } });
  });

  it("with no tenant set, scoped queries see nothing", async () => {
    const rows = await withTenant("00000000-0000-0000-0000-000000000000", (tx) => tx.execute(sql`select count(*)::int as n from orders`));
    expect(rows.rows[0]).toEqual({ n: 0 });
  });
});

describe("order → payment → dockets → loyalty", () => {
  it("releases dockets only after a verified webhook, exactly once", async () => {
    const c = await guest("+353870000001");
    const [table] = await svc.venueTables(mj);
    const order = await svc.createOrder(
      {
        venue: mj,
        customer: c,
        channel: "table",
        tableId: table.id,
        lines: [
          { menuItemId: await itemId(mj, "Pint of stout"), qty: 2 },
          { menuItemId: await itemId(mj, "Fish & chips"), qty: 1 },
        ],
        creditRequestedCents: 0,
        useDouble: false,
        idempotencyKey: "k1",
      },
      provider,
    );
    expect(order.status).toBe("pending_payment");
    expect(order.grossCents).toBe(2 * 620 + 1700);
    expect(await withTenant(mj.tenantId, (tx) => tx.select().from(t.docket))).toHaveLength(0);

    // Same idempotency key → same order.
    const again = await svc.createOrder(
      { venue: mj, customer: c, channel: "table", tableId: table.id, lines: [{ menuItemId: await itemId(mj, "Soft drink"), qty: 1 }], creditRequestedCents: 0, useDouble: false, idempotencyKey: "k1" },
      provider,
    );
    expect(again.id).toBe(order.id);

    // Forged webhook is rejected and changes nothing.
    const bad = await svc.handleWebhook(provider, JSON.stringify({ event: "ORDER_COMPLETED", order_id: order.providerOrderId }), new Headers());
    expect(bad.status).toBe(401);

    expect((await pay(order)).status).toBe(200);
    expect((await pay(order)).status).toBe(200); // duplicate delivery

    const view = await svc.orderForCustomer(mj, order.id, c.id);
    expect(view.order.status).toBe("paid");
    expect(view.dockets.map((d) => d.station).sort()).toEqual(["bar", "kitchen"]);
    expect(view.dockets.find((d) => d.station === "bar")!.idCheckRequired).toBe(true);
    expect(view.pointsEarned).toBe(Math.floor((2940 * 10) / 100));

    const sum = await svc.memberSummary(mj, c.id);
    expect(sum.balances.creditCents).toBe(1000); // sign-up credit
    expect(sum.spend12mCents).toBe(2940);
  });

  it("uses credit, earns only on the card amount, and settles a fully-credited order without Revolut", async () => {
    const c = await guest("+353870000002");
    const order = await svc.createOrder(
      { venue: mj, customer: c, channel: "collect", tableId: null, lines: [{ menuItemId: await itemId(mj, "Soft drink"), qty: 2 }], creditRequestedCents: 99_999, useDouble: false, idempotencyKey: "k2" },
      provider,
    );
    expect(order.creditUsedCents).toBe(700);
    expect(order.amountPaidCents).toBe(0);
    expect(order.status).toBe("paid");
    expect(order.providerOrderId).toBeNull();
    const sum = await svc.memberSummary(mj, c.id);
    expect(sum.balances).toEqual({ points: 0, creditCents: 300, doubles: 0 });
  });

  it("refuses food for collection", async () => {
    const c = await guest("+353870000003");
    await expect(
      svc.createOrder(
        { venue: mj, customer: c, channel: "collect", tableId: null, lines: [{ menuItemId: await itemId(mj, "Fish & chips"), qty: 1 }], creditRequestedCents: 0, useDouble: false, idempotencyKey: "k3" },
        provider,
      ),
    ).rejects.toThrow(/collected/);
  });

  it("rejects a table from another venue", async () => {
    const c = await guest("+353870000004");
    const [drumTable] = await svc.venueTables(drum);
    await expect(
      svc.createOrder(
        { venue: mj, customer: c, channel: "table", tableId: drumTable.id, lines: [{ menuItemId: await itemId(mj, "Soft drink"), qty: 1 }], creditRequestedCents: 0, useDouble: false, idempotencyKey: "k4" },
        provider,
      ),
    ).rejects.toThrow();
  });
});

describe("ID check at the bar", () => {
  it("blocks collection until ID is checked, then remembers the guest", async () => {
    const c = await guest("+353870000005");
    const staff = (await svc.staffByEmail("staff@mjoconnors.example"))!;
    const mk = async (key: string) => {
      const o = await svc.createOrder(
        { venue: mj, customer: c, channel: "collect", tableId: null, lines: [{ menuItemId: await itemId(mj, "Pint of lager"), qty: 1 }], creditRequestedCents: 0, useDouble: false, idempotencyKey: key },
        provider,
      );
      await pay(o);
      return (await svc.stationDockets(staff, "bar")).find((d) => d.orderId === o.id)!;
    };
    const d = await mk("id1");
    expect(d.idCheckRequired).toBe(true);
    await svc.advanceDocket(staff, d.id, "in_progress");
    await svc.advanceDocket(staff, d.id, "ready");
    await expect(svc.advanceDocket(staff, d.id, "done")).rejects.toThrow(/Check ID/);
    await svc.recordIdCheck(staff, d.id, "age_card");
    await svc.advanceDocket(staff, d.id, "done");
    expect((await svc.customerById(c.id))!.ageVerificationMethod).toBe("staff_id_check");

    const d2 = await mk("id2");
    expect(d2.idCheckRequired).toBe(false);
  });

  it("refusing ID refunds the order and reverses its points", async () => {
    const c = await guest("+353870000006");
    const staff = (await svc.staffByEmail("staff@mjoconnors.example"))!;
    const o = await svc.createOrder(
      { venue: mj, customer: c, channel: "collect", tableId: null, lines: [{ menuItemId: await itemId(mj, "Gin & tonic"), qty: 1 }], creditRequestedCents: 0, useDouble: false, idempotencyKey: "ref1" },
      provider,
    );
    await pay(o);
    const d = (await svc.stationDockets(staff, "bar")).find((x) => x.orderId === o.id)!;
    await svc.refuseId(staff, d.id, provider);
    const view = await svc.orderForCustomer(mj, o.id, c.id);
    expect(view.order.status).toBe("refunded");
    expect(view.pointsEarned).toBe(0);
  });

  it("staff can't touch another venue's dockets", async () => {
    const drumStaff = (await svc.staffByEmail("staff@drumhierny.example"))!;
    const mjStaff = (await svc.staffByEmail("staff@mjoconnors.example"))!;
    const [d] = await svc.stationDockets(mjStaff, "bar");
    await expect(svc.advanceDocket(drumStaff, d.id, "in_progress")).rejects.toThrow(/not found/);
  });
});

describe("billing", () => {
  it("builds the month's statement from app payments", async () => {
    const now = new Date();
    const s = await svc.billingStatement(mj, now.getUTCFullYear(), now.getUTCMonth() + 1);
    expect(s.subscriptionCents).toBe(9900);
    expect(s.appGrossCents).toBeGreaterThan(0);
    expect(s.appFeeCents).toBe(Math.floor((s.netAppCents * 100 + 5000) / 10000));
  });
});
