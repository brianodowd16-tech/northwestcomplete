import { walletSplit } from "@round/core";
import { and, eq, sql } from "drizzle-orm";
import type { Tx } from "./index";
import * as t from "./schema";

/** Complete Points balances (sums of the ledger, never stored), in cents. */
export async function walletBalances(tx: Tx, customerId: string) {
  const rows = await tx
    .select({ kind: t.walletLedger.kind, total: sql<number>`coalesce(sum(${t.walletLedger.delta}), 0)::int` })
    .from(t.walletLedger)
    .where(eq(t.walletLedger.customerId, customerId))
    .groupBy(t.walletLedger.kind);
  return { paid: rows.find((r) => r.kind === "paid")?.total ?? 0, bonus: rows.find((r) => r.kind === "bonus")?.total ?? 0 };
}

/**
 * Spends points on an order inside its transaction (the guest's row is locked so two orders can't
 * spend the same points). Bonus points only on the non-alcohol part. Returns what points paid.
 */
export async function spendWalletTx(tx: Tx, input: { customerId: string; venueId: string; orderId: string; dueCents: number; nonAlcoholDueCents: number }) {
  await tx.execute(sql`select 1 from customer where id = ${input.customerId} for update`);
  const b = await walletBalances(tx, input.customerId);
  const s = walletSplit({ dueCents: input.dueCents, nonAlcoholDueCents: input.nonAlcoholDueCents, paidBalance: b.paid, bonusBalance: b.bonus });
  const lines = [
    ...(s.paidCents ? [{ kind: "paid" as const, delta: -s.paidCents }] : []),
    ...(s.bonusCents ? [{ kind: "bonus" as const, delta: -s.bonusCents }] : []),
  ];
  if (lines.length)
    await tx.insert(t.walletLedger).values(lines.map((l) => ({ customerId: input.customerId, kind: l.kind, delta: l.delta, reason: "redeem" as const, venueId: input.venueId, orderId: input.orderId, refKey: `redeem:${input.orderId}:${l.kind}` })));
  return s;
}

/** Puts an order's points back (cancelled or refunded). Once per order. */
export async function reverseWalletTx(tx: Tx, orderId: string) {
  const spent = await tx.select().from(t.walletLedger).where(and(eq(t.walletLedger.orderId, orderId), eq(t.walletLedger.reason, "redeem")));
  for (const l of spent)
    await tx.insert(t.walletLedger).values({ customerId: l.customerId, kind: l.kind, delta: -l.delta, reason: "reversal", venueId: l.venueId, orderId, refKey: `reversal:${orderId}:${l.kind}` }).onConflictDoNothing();
}
