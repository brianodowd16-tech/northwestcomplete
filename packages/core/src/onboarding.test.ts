import { describe, expect, it } from "vitest";
import { OnboardingError, normaliseEmail, parseEuro, setupChecklist, slugify, trialAdjust, validateSignup } from "./onboarding";

const ok = { email: " Owner@Example.IE ", ownerName: "Áine Byrne", password: "copper-kettle-42", venueName: "The Corner House", kind: "bar", town: "Sligo", tables: 12, exampleMenu: true, acceptTerms: true };

describe("business sign-up", () => {
  it("cleans valid input", () => {
    expect(validateSignup(ok)).toMatchObject({ email: "owner@example.ie", venueName: "The Corner House", kind: "bar", tables: 12 });
  });
  it.each([
    [{ email: "nope" }, /valid email/],
    [{ password: "short" }, /at least 10/],
    [{ password: "password1234" }, /too easy/],
    [{ password: "thecornerhouse!!" }, /venue name/],
    [{ tables: 500 }, /0 to 200/],
    [{ tables: 2.5 }, /whole number/],
    [{ kind: "casino" }, /kind of venue/],
    [{ acceptTerms: false }, /terms/],
    [{ venueName: " " }, /venue's name/],
  ])("rejects %o", (patch, msg) => {
    expect(() => validateSignup({ ...ok, ...patch } as typeof ok)).toThrow(msg);
    expect(() => validateSignup({ ...ok, ...patch } as typeof ok)).toThrow(OnboardingError);
  });
  it("normalises email and slugs", () => {
    expect(normaliseEmail("a b@x.ie")).toBeNull();
    expect(slugify("MJ O'Connor's, Carrick & Co")).toBe("mj-oconnors-carrick-and-co");
    expect(slugify("Café Éire")).toBe("cafe-eire");
    expect(slugify("!!")).toBe("venue");
  });
  it("parses euro amounts to cents", () => {
    expect(parseEuro("6.20")).toBe(620);
    expect(parseEuro("€6,5")).toBe(650);
    expect(parseEuro(12)).toBe(1200);
    expect(() => parseEuro("-1")).toThrow();
    expect(() => parseEuro("6.205")).toThrow();
  });
});

describe("go-live checklist", () => {
  const base = { emailVerified: true, activeItems: 3, tables: 10, paymentsReady: true, vatNumber: "IE 1234567 T", googlePlace: false, xeroConnected: false, staffCount: 1 };
  it("lets a venue go live once the required steps are done", () => {
    expect(setupChecklist(base, "x").canGoLive).toBe(true);
  });
  it("names what's missing", () => {
    const r = setupChecklist({ ...base, paymentsReady: false, activeItems: 0, vatNumber: "" }, "x");
    expect(r.canGoLive).toBe(false);
    expect(r.missing).toHaveLength(3);
  });
});

describe("free trial billing", () => {
  const nov = [new Date("2026-11-01T00:00:00Z"), new Date("2026-12-01T00:00:00Z")] as const;
  it("charges nothing for a month inside the trial", () => {
    expect(trialAdjust(new Date("2026-12-20T00:00:00Z"), ...nov, 9900)).toEqual({ chargeFrom: nov[1], subscriptionCents: 0 });
  });
  it("charges the share of the month after the trial", () => {
    const r = trialAdjust(new Date("2026-11-16T00:00:00Z"), ...nov, 9900);
    expect(r.subscriptionCents).toBe(4950);
    expect(r.chargeFrom.toISOString()).toBe("2026-11-16T00:00:00.000Z");
  });
  it("charges the full month without a trial", () => {
    expect(trialAdjust(null, ...nov, 9900).subscriptionCents).toBe(9900);
  });
});
