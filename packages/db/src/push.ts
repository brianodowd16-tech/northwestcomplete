import { eq, inArray } from "drizzle-orm";
import { systemDb, withTenant } from "./index";
import * as t from "./schema";
import type { Staff } from "./services";

// Web Push subscriptions belong to the guest (platform-level), so one opt-in covers every venue.

export async function savePushSubscription(customerId: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  if (!/^https:\/\//.test(sub?.endpoint ?? "") || !sub.keys?.p256dh || !sub.keys?.auth || sub.endpoint.length > 1000) throw new Error("Bad subscription");
  const row = { customerId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth };
  await systemDb().insert(t.pushSubscription).values(row).onConflictDoUpdate({ target: t.pushSubscription.endpoint, set: row });
}

export async function deletePushSubscriptions(endpoints: string[]) {
  if (endpoints.length) await systemDb().delete(t.pushSubscription).where(inArray(t.pushSubscription.endpoint, endpoints));
}

export async function hasPush(customerId: string) {
  return (await systemDb().select({ id: t.pushSubscription.id }).from(t.pushSubscription).where(eq(t.pushSubscription.customerId, customerId)).limit(1)).length > 0;
}

/** Who to notify about a docket, and with what. Null if the docket isn't this staff member's venue. */
export async function docketNotice(staff: Staff, docketId: string) {
  const row = await withTenant(staff.tenantId, async (tx) => {
    const [d] = await tx.select().from(t.docket).where(eq(t.docket.id, docketId));
    if (!d || d.venueId !== staff.venueId) return null;
    const [o] = await tx.select().from(t.orders).where(eq(t.orders.id, d.orderId));
    const [v] = await tx.select().from(t.venue).where(eq(t.venue.id, d.venueId));
    return { station: d.station, idCheck: d.idCheckRequired && !d.idCheckedAt, orderId: o.id, orderNumber: o.number, customerId: o.customerId, venueName: v.name, slug: v.slug, status: d.status };
  });
  if (!row) return null;
  const subs = await systemDb().select().from(t.pushSubscription).where(eq(t.pushSubscription.customerId, row.customerId));
  return { ...row, subs };
}
