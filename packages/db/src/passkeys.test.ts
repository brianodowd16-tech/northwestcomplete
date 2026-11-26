import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool, systemDb } from "./index";
import * as pk from "./passkeys";
import { deleteGuest } from "./privacy";
import * as t from "./schema";
import { seed } from "./seed";
import * as svc from "./services";
import { resetDatabase } from "./setup";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://round:round@localhost:5432/round_test";
let mj: svc.Venue, drum: svc.Venue, manager: svc.Staff, drumManager: svc.Staff;
beforeAll(async () => {
  await seed(await resetDatabase());
  mj = await svc.venueBySlug("mj-oconnors");
  drum = await svc.venueBySlug("drumhierny");
  [manager] = await systemDb().select().from(t.staffUser).where(eq(t.staffUser.venueId, mj.id));
  [drumManager] = await systemDb().select().from(t.staffUser).where(eq(t.staffUser.venueId, drum.id));
});
afterAll(() => pool().end());

const key = (n: number) => ({ credentialId: `cred-${n}`, publicKey: "pk", counter: 0, transports: ["internal"], name: "iPhone" });

describe("passkeys", () => {
  it("belong to one owner, who alone can remove them", async () => {
    const g = await svc.createCustomer({ phone: "+353871239999", name: "Ger M", email: "g@x.ie", dateOfBirth: "1990-01-01", marketingConsent: false });
    const k = await pk.addPasskey({ kind: "guest", id: g.id }, key(1));
    expect((await pk.passkeyByCredential("cred-1"))?.ownerId).toBe(g.id);
    await expect(pk.removePasskey("staff", g.id, k.id)).rejects.toThrow(/not found/);
    await expect(pk.removePasskey("guest", manager.id, k.id)).rejects.toThrow(/not found/);
    await pk.touchPasskey(k.id, 5);
    expect((await pk.passkeyByCredential("cred-1"))?.counter).toBe(5);
    await deleteGuest(g.id);
    expect(await pk.passkeyByCredential("cred-1")).toBeNull();
  });

  it("caps each person at 10", async () => {
    for (let i = 10; i < 20; i++) await pk.addPasskey({ kind: "staff", id: manager.id }, key(i));
    await expect(pk.addPasskey({ kind: "staff", id: manager.id }, key(99))).rejects.toThrow(/10 passkeys/);
  });

  it("lets a manager clear a team member's authenticator and passkeys, only in their own venue", async () => {
    await pk.setStaffTotp(manager.id, "enc", 1);
    await expect(pk.resetStaffSignIn(drum, drumManager, manager.id)).rejects.toThrow(/not found/i);
    await pk.resetStaffSignIn(mj, manager, manager.id);
    const [s] = await systemDb().select().from(t.staffUser).where(eq(t.staffUser.id, manager.id));
    expect(s.totpSecretEnc).toBeNull();
    expect(await pk.passkeysFor("staff", manager.id)).toEqual([]);
  });
});
