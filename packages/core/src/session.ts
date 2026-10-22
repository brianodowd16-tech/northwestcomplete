import { createHmac, randomInt, scryptSync, timingSafeEqual, randomBytes } from "node:crypto";

// Signed cookie values: `{payload}.{hmac}`. Payload is `{kind}:{id}:{expiresAtMs}`.

export type SessionKind = "guest" | "staff" | "phone";

function mac(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function signSession(kind: SessionKind, id: string, secret: string, ttlMs: number, now = Date.now()): string {
  const payload = `${kind}:${id}:${now + ttlMs}`;
  return `${payload}.${mac(payload, secret)}`;
}

export function verifySession(value: string | undefined, kind: SessionKind, secret: string, now = Date.now()): string | null {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot < 0) return null;
  const payload = value.slice(0, dot);
  const given = Buffer.from(value.slice(dot + 1));
  const expected = Buffer.from(mac(payload, secret));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const [k, id, exp] = payload.split(":");
  if (k !== kind || !id || Number(exp) < now) return null;
  return id;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 32).toString("hex")}`;
}

export function checkPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const a = scryptSync(password, salt, 32);
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function newOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashOtp(phone: string, code: string, secret: string): string {
  return createHmac("sha256", secret).update(`${phone}:${code}`).digest("hex");
}

/** Normalises Irish numbers to E.164 (+353...). Returns null if it doesn't look valid. */
export function normalisePhone(input: string): string | null {
  let p = input.replace(/[\s()-]/g, "");
  if (p.startsWith("00")) p = "+" + p.slice(2);
  if (p.startsWith("0")) p = "+353" + p.slice(1);
  return /^\+\d{9,15}$/.test(p) ? p : null;
}
