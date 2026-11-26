// Passkeys (Face ID / Touch ID, Windows Hello, Google Password Manager, security keys) for
// guests and staff, and authenticator-app codes for staff. Only public keys and encrypted
// TOTP secrets are stored.
import { and, asc, eq } from "drizzle-orm";
import { systemDb, withTenant } from "./index";
import * as t from "./schema";
import { NotFound, type Staff, type Venue } from "./services";

export type OwnerKind = "guest" | "staff";
export type Passkey = typeof t.passkey.$inferSelect;

export async function addPasskey(owner: { kind: OwnerKind; id: string }, k: { credentialId: string; publicKey: string; counter: number; transports: string[]; name: string }) {
  const existing = await systemDb().select({ id: t.passkey.id }).from(t.passkey).where(and(eq(t.passkey.ownerKind, owner.kind), eq(t.passkey.ownerId, owner.id)));
  if (existing.length >= 10) throw new NotFound("You already have 10 passkeys: remove one first");
  const [row] = await systemDb().insert(t.passkey).values({ ownerKind: owner.kind, ownerId: owner.id, ...k, name: k.name.slice(0, 60) || "Passkey" }).returning();
  return row;
}

export async function passkeysFor(kind: OwnerKind, ownerId: string) {
  return systemDb().select().from(t.passkey).where(and(eq(t.passkey.ownerKind, kind), eq(t.passkey.ownerId, ownerId))).orderBy(asc(t.passkey.createdAt));
}

export async function passkeyByCredential(credentialId: string) {
  const [row] = await systemDb().select().from(t.passkey).where(eq(t.passkey.credentialId, credentialId));
  return row ?? null;
}

/** After a successful sign-in: the authenticator's new counter and when it was used. */
export async function touchPasskey(id: string, counter: number) {
  await systemDb().update(t.passkey).set({ counter, lastUsedAt: new Date() }).where(eq(t.passkey.id, id));
}

export async function removePasskey(kind: OwnerKind, ownerId: string, id: string) {
  const r = await systemDb().delete(t.passkey).where(and(eq(t.passkey.id, id), eq(t.passkey.ownerKind, kind), eq(t.passkey.ownerId, ownerId))).returning();
  if (!r.length) throw new NotFound("Passkey not found");
}

// ---------------------------------------------------------------- authenticator codes (staff)

export async function setStaffTotp(staffId: string, secretEnc: string | null, lastStep: number | null) {
  await systemDb().update(t.staffUser).set({ totpSecretEnc: secretEnc, totpLastStep: lastStep }).where(eq(t.staffUser.id, staffId));
}

/** Records the step of a code just used, so the same code can't be used again. */
export async function useTotpStep(staffId: string, step: number) {
  await systemDb().update(t.staffUser).set({ totpLastStep: step }).where(eq(t.staffUser.id, staffId));
}

/** A manager clears someone's authenticator and passkeys (lost phone); they sign in with their password again. */
export async function resetStaffSignIn(venue: Venue, by: Staff, staffId: string) {
  if (by.role !== "admin" || by.venueId !== venue.id) throw new NotFound("Not found");
  await withTenant(venue.tenantId, async (tx) => {
    const r = await tx.update(t.staffUser).set({ totpSecretEnc: null, totpLastStep: null }).where(and(eq(t.staffUser.id, staffId), eq(t.staffUser.venueId, venue.id))).returning();
    if (!r.length) throw new NotFound("Not found");
    await tx.insert(t.auditLog).values({ tenantId: venue.tenantId, actor: `staff:${by.id}`, action: "staff.signin_reset", entity: `staff:${staffId}` });
  });
  await systemDb().delete(t.passkey).where(and(eq(t.passkey.ownerKind, "staff"), eq(t.passkey.ownerId, staffId)));
}
