import "server-only";
import { signSession, verifySession } from "@round/core";
import { addPasskey, passkeyByCredential, passkeysFor, touchPasskey, type OwnerKind } from "@round/db/passkeys";
import {
  generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse,
  type AuthenticationResponseJSON, type AuthenticatorTransportFuture, type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { isoBase64URL, isoUint8Array } from "@simplewebauthn/server/helpers";
import { cookies } from "next/headers";
import { appUrl, sessionSecret } from "./server";

// Passkeys: the device unlocks with Face ID / Touch ID, Windows Hello, a fingerprint or PIN,
// and proves it holds the private key. User verification is always required, so a passkey
// sign-in (or clock-in) proves the person, not just the phone.

const COOKIE = "round_webauthn";
const rp = () => {
  const u = new URL(appUrl());
  return { rpID: u.hostname, origin: u.origin, rpName: "Complete" };
};

type Purpose = "register" | "login" | "clock";

async function remember(purpose: Purpose, kind: OwnerKind, challenge: string, ownerId = "") {
  (await cookies()).set(COOKIE, signSession("webauthn", `${purpose}|${kind}|${ownerId}|${challenge}`, sessionSecret(), 5 * 60_000), {
    httpOnly: true, sameSite: "strict", path: "/", maxAge: 300, secure: process.env.NODE_ENV === "production",
  });
}

/** The challenge this browser was given (once: the cookie is cleared as it's read). */
async function recall(purpose: Purpose, kind: OwnerKind) {
  const jar = await cookies();
  const v = verifySession(jar.get(COOKIE)?.value, "webauthn", sessionSecret());
  jar.delete(COOKIE);
  if (!v) return null;
  const [p, k, ownerId, challenge] = v.split("|");
  return p === purpose && k === kind ? { ownerId, challenge } : null;
}

export async function registrationOptions(owner: { kind: OwnerKind; id: string; name: string; label: string }) {
  const { rpID, rpName } = rp();
  const existing = await passkeysFor(owner.kind, owner.id);
  const opts = await generateRegistrationOptions({
    rpName, rpID,
    userName: owner.label,
    userDisplayName: owner.name,
    userID: isoUint8Array.fromUTF8String(`${owner.kind}:${owner.id}`),
    attestationType: "none",
    excludeCredentials: existing.map((k) => ({ id: k.credentialId, transports: k.transports as AuthenticatorTransportFuture[] })),
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  });
  await remember("register", owner.kind, opts.challenge, owner.id);
  return opts;
}

export async function finishRegistration(owner: { kind: OwnerKind; id: string }, response: RegistrationResponseJSON, name: string) {
  const saved = await recall("register", owner.kind);
  if (!saved || saved.ownerId !== owner.id) throw new PasskeyError("That took too long. Try again.");
  const { rpID, origin } = rp();
  const v = await verifyRegistrationResponse({ response, expectedChallenge: saved.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true }).catch(() => null);
  if (!v?.verified || !v.registrationInfo) throw new PasskeyError("Your device didn't confirm the passkey. Try again.");
  const c = v.registrationInfo.credential;
  return addPasskey(owner, { credentialId: c.id, publicKey: isoBase64URL.fromBuffer(c.publicKey), counter: c.counter, transports: c.transports ?? [], name });
}

/** Options for signing in (or clocking in) with any passkey saved on this device: no username needed. */
export async function authenticationOptions(purpose: "login" | "clock", kind: OwnerKind) {
  const opts = await generateAuthenticationOptions({ rpID: rp().rpID, userVerification: "required", allowCredentials: [] });
  await remember(purpose, kind, opts.challenge);
  return opts;
}

/** Checks the signed challenge and returns who it was. */
export async function finishAuthentication(purpose: "login" | "clock", kind: OwnerKind, response: AuthenticationResponseJSON) {
  const saved = await recall(purpose, kind);
  if (!saved) throw new PasskeyError("That took too long. Try again.");
  const key = await passkeyByCredential(response.id);
  if (!key || key.ownerKind !== kind) throw new PasskeyError("This passkey isn't registered here. Sign in another way and add it.");
  const { rpID, origin } = rp();
  const v = await verifyAuthenticationResponse({
    response, expectedChallenge: saved.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true,
    credential: { id: key.credentialId, publicKey: isoBase64URL.toBuffer(key.publicKey), counter: key.counter, transports: key.transports as AuthenticatorTransportFuture[] },
  }).catch(() => null);
  if (!v?.verified) throw new PasskeyError("Your device didn't confirm it's you. Try again.");
  await touchPasskey(key.id, v.authenticationInfo.newCounter);
  return key.ownerId;
}

export class PasskeyError extends Error {}

/** A name for the passkey from the browser, e.g. "iPhone", "Windows", "Android". */
export function deviceName(ua: string | null) {
  const u = ua ?? "";
  return /iPhone/.test(u) ? "iPhone" : /iPad/.test(u) ? "iPad" : /Mac OS X/.test(u) ? "Mac" : /Android/.test(u) ? "Android" : /Windows/.test(u) ? "Windows" : /CrOS/.test(u) ? "Chromebook" : "Passkey";
}
