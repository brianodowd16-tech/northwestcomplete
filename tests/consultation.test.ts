import { describe, expect, it } from "vitest";
import { STEPS, describeAnswers, nextStep, recommend, stepsFor } from "@/lib/consultation";
import { enabledFulfilment, getFulfilment } from "@/lib/fulfilment";

describe("consultation flow", () => {
  it("walks every step for a stove project", () => {
    expect(nextStep({})?.id).toBe("project");
    expect(nextStep({ project: "stove" })?.id).toBe("fuel");
    expect(nextStep({ project: "stove", fuel: "wood", home: "chimney", room: "medium", timing: "soon" })).toBeNull();
    expect(stepsFor({ project: "stove" })).toHaveLength(STEPS.length);
  });

  it("finishes straight away for servicing, and skips house questions for outdoor", () => {
    expect(nextStep({ project: "service" })).toBeNull();
    expect(stepsFor({ project: "outdoor" }).map((s) => s.id)).toEqual(["project", "timing"]);
  });

  it("gives chimney, Ecodesign and CO advice for a wood stove in an older home", () => {
    const r = recommend({ project: "stove", fuel: "wood", home: "chimney", room: "medium", timing: "soon" });
    expect(r.title).toBe("A wood or multi-fuel stove for an older home with a chimney");
    expect(r.output).toBe("around 3–5 kW");
    expect(r.priority).toBe("high");
    expect(r.points.join(" ")).toMatch(/liner/);
    expect(r.points.join(" ")).toMatch(/Ecodesign/);
    expect(r.points.join(" ")).toMatch(/carbon monoxide/);
    expect(r.links[0].href).toBe("/range/stoves");
  });

  it("steers apartments to electric", () => {
    const r = recommend({ project: "stove", fuel: "wood", home: "apartment", room: "small", timing: "research" });
    expect(r.title).toMatch(/electric fire/);
    expect(r.points.join(" ")).not.toMatch(/carbon monoxide/);
    expect(r.priority).toBe("low");
  });

  it("flags the RGI requirement and room-sealed rules for gas in an airtight home", () => {
    const r = recommend({ project: "stove", fuel: "gas", home: "airtight", room: "large", timing: "quarter" });
    const text = r.points.join(" ");
    expect(text).toMatch(/Registered Gas Installer/);
    expect(text).toMatch(/Part J/);
    expect(text).toMatch(/balanced-flue/);
  });

  it("summarises answers for the team", () => {
    expect(describeAnswers({ project: "service" })).toBe("What are you planning? Servicing or parts");
  });
});

describe("fulfilment", () => {
  it("offers Click & Collect only, for now", () => {
    expect(enabledFulfilment().map((o) => o.id)).toEqual(["collect"]);
    expect(getFulfilment("delivery")).toBeUndefined();
  });
});
