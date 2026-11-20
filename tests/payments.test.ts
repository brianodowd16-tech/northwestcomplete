import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sign, type Fields } from "@/lib/mypos";

// Stand-in for myPOS's signing key so we can produce valid callbacks.
const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 1024 });
const MYPOS_PRIV = privateKey.export({ type: "pkcs1", format: "pem" }).toString();
const MYPOS_PUB = publicKey.export({ type: "spki", format: "pem" }).toString();

vi.mock("@/lib/config", async (orig) => {
  const real = await orig<typeof import("@/lib/config")>();
  return { ...real, myposConfig: () => ({ ...real.myposConfig(), publicCert: MYPOS_PUB }) };
});

const store = new Map<number, { id: number; status: string; total: string; currency: string; transaction_id: string }>();
const notes: string[] = [];

vi.mock("@/lib/woo", () => ({
  PAID_STATUSES: new Set(["processing", "completed"]),
  getOrder: async (id: number) => {
    const o = store.get(id);
    if (!o) throw new Error("404");
    return { ...o };
  },
  updateOrder: async (id: number, patch: Record<string, unknown>) => {
    const o = store.get(id)!;
    if (patch.set_paid) o.status = "processing";
    if (patch.status) o.status = String(patch.status);
    if (patch.transaction_id) o.transaction_id = String(patch.transaction_id);
    return o;
  },
  addOrderNote: async (_id: number, note: string) => notes.push(note),
}));

const { handleNotify } = await import("@/lib/payments");

function callback(over: Record<string, string> = {}): Fields {
  const base: Fields = Object.entries({
    IPCmethod: "IPCPurchaseNotify",
    SID: "000000000000010",
    Amount: "1250.00",
    Currency: "EUR",
    OrderID: "ODW77TLX1",
    IPC_Trnref: "TRN123",
    RequestSTAN: "1",
    RequestDateTime: "2026-11-20 10:00:00",
    ...over,
  });
  return [...base, ["Signature", sign(base, MYPOS_PRIV)]];
}

beforeEach(() => {
  store.clear();
  notes.length = 0;
  store.set(77, { id: 77, status: "pending", total: "1250.00", currency: "EUR", transaction_id: "" });
});
afterEach(() => vi.clearAllMocks());

describe("handleNotify", () => {
  it("marks a correctly signed, correctly priced order as paid and replies OK", async () => {
    const r = await handleNotify(callback());
    expect(r).toMatchObject({ ok: true, status: 200, body: "OK" });
    expect(store.get(77)).toMatchObject({ status: "processing", transaction_id: "TRN123" });
  });

  it("is idempotent when myPOS retries", async () => {
    await handleNotify(callback());
    const r = await handleNotify(callback());
    expect(r.body).toBe("OK");
  });

  it("rejects a bad signature without touching the order", async () => {
    const f = callback();
    f[2] = ["Amount", "1.00"];
    const r = await handleNotify(f);
    expect(r.body).not.toBe("OK");
    expect(store.get(77)!.status).toBe("pending");
  });

  it("rejects a payment for the wrong amount", async () => {
    const r = await handleNotify(callback({ Amount: "1.00" }));
    expect(r.body).not.toBe("OK");
    expect(store.get(77)!.status).toBe("pending");
    expect(notes.join()).toMatch(/REJECTED/);
  });

  it("rejects an unknown order", async () => {
    const r = await handleNotify(callback({ OrderID: "ODW999TX" }));
    expect(r.body).not.toBe("OK");
  });

  it("puts a paid order on hold if myPOS rolls the payment back", async () => {
    await handleNotify(callback());
    const r = await handleNotify(callback({ IPCmethod: "IPCPurchaseRollback" }));
    expect(r.body).toBe("OK");
    expect(store.get(77)!.status).toBe("on-hold");
  });
});
