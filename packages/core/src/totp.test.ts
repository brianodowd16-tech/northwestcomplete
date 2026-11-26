import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, newTotpSecret, otpauthUri, totpCode, verifyTotp } from "./index";

// RFC 6238 test secret ("12345678901234567890"), 6-digit codes from the RFC's SHA-1 vectors.
const RFC = base32Encode(Buffer.from("12345678901234567890"));

describe("authenticator codes", () => {
  it("matches the RFC 6238 test vectors", () => {
    expect(RFC).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(totpCode(RFC, Math.floor(59 / 30))).toBe("287082");
    expect(totpCode(RFC, Math.floor(1111111109 / 30))).toBe("081804");
    expect(totpCode(RFC, Math.floor(1234567890 / 30))).toBe("005924");
    expect(base32Decode(RFC).toString()).toBe("12345678901234567890");
  });

  it("accepts one step of drift, refuses reuse and junk", () => {
    const now = 1234567890_000;
    const step = Math.floor(now / 30_000);
    expect(verifyTotp(RFC, "005924", now)).toBe(step);
    expect(verifyTotp(RFC, totpCode(RFC, step - 1), now)).toBe(step - 1);
    expect(verifyTotp(RFC, totpCode(RFC, step - 2), now)).toBeNull();
    expect(verifyTotp(RFC, "005924", now, step)).toBeNull(); // already used
    expect(verifyTotp(RFC, "00592", now)).toBeNull();
    expect(verifyTotp(RFC, "005 924", now)).toBe(step);
  });

  it("makes 160-bit secrets and the QR link apps read", () => {
    expect(base32Decode(newTotpSecret())).toHaveLength(20);
    expect(otpauthUri("aoife@mjs.ie", "ABC")).toBe("otpauth://totp/Complete%3Aaoife%40mjs.ie?secret=ABC&issuer=Complete&algorithm=SHA1&digits=6&period=30");
  });
});
