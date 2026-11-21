/**
 * Guided consultation: a short set of questions that turns a customer's
 * answers into a recommendation and a lead for the team. Plain data and pure
 * functions, so it runs in the browser and can be edited or extended without
 * touching the UI.
 */

export type Option = { id: string; label: string; hint?: string };
export type Step = { id: StepId; question: string; help?: string; options: Option[] };

export type StepId = "project" | "fuel" | "home" | "room" | "timing";
export type Answers = Partial<Record<StepId, string>>;

export const STEPS: Step[] = [
  {
    id: "project",
    question: "What are you planning?",
    options: [
      { id: "stove", label: "A new stove", hint: "Wood, multi-fuel, gas, pellet or electric" },
      { id: "fireplace", label: "A fireplace or surround", hint: "Marble, limestone, timber or cast iron" },
      { id: "replace", label: "Replacing an existing fire", hint: "Upgrading an open fire or old stove" },
      { id: "outdoor", label: "Outdoor heating", hint: "Fire pits, garden stoves, kamados" },
      { id: "service", label: "Servicing or parts", hint: "Seals, glass, grates, repairs" },
    ],
  },
  {
    id: "fuel",
    question: "Do you have a fuel in mind?",
    options: [
      { id: "wood", label: "Wood or multi-fuel" },
      { id: "gas", label: "Gas (natural gas or LPG)" },
      { id: "electric", label: "Electric" },
      { id: "pellet", label: "Pellet" },
      { id: "unsure", label: "Not sure yet" },
    ],
  },
  {
    id: "home",
    question: "Tell us about the house",
    help: "This decides the flue and ventilation options.",
    options: [
      { id: "chimney", label: "Older home with a chimney" },
      { id: "airtight", label: "Newer, airtight home", hint: "Built or retrofitted to A or B BER" },
      { id: "nochimney", label: "House with no chimney" },
      { id: "apartment", label: "Apartment" },
    ],
  },
  {
    id: "room",
    question: "How big is the room?",
    help: "Length × width × ceiling height. A typical living room is 40–60 m³.",
    options: [
      { id: "small", label: "Small", hint: "Under 35 m³" },
      { id: "medium", label: "Medium", hint: "35–70 m³" },
      { id: "large", label: "Large", hint: "Over 70 m³" },
      { id: "open", label: "Open-plan or whole house" },
    ],
  },
  {
    id: "timing",
    question: "When would you like it in?",
    options: [
      { id: "soon", label: "Within a month" },
      { id: "quarter", label: "In 1–3 months" },
      { id: "research", label: "Just researching" },
    ],
  },
];

/** Which steps apply, given the answers so far. Servicing and outdoor skip the house questions. */
export function stepsFor(answers: Answers): Step[] {
  if (answers.project === "service") return STEPS.filter((s) => s.id === "project");
  if (answers.project === "outdoor") return STEPS.filter((s) => s.id === "project" || s.id === "timing");
  return STEPS;
}

export function nextStep(answers: Answers): Step | null {
  return stepsFor(answers).find((s) => !answers[s.id]) ?? null;
}

export function labelFor(step: StepId, id: string | undefined): string {
  return STEPS.find((s) => s.id === step)?.options.find((o) => o.id === id)?.label ?? "";
}

export type Recommendation = {
  title: string;
  summary: string;
  output?: string;
  points: string[];
  links: { label: string; href: string }[];
  priority: "high" | "normal" | "low";
};

const KW: Record<string, string> = {
  small: "around 2–3 kW",
  medium: "around 3–5 kW",
  large: "around 5–8 kW",
  open: "sized on survey (open-plan and whole-house heating are calculated room by room)",
};

/** Turns the answers into advice. General guidance only: the team confirms on survey. */
export function recommend(a: Answers): Recommendation {
  const priority = a.timing === "soon" ? "high" : a.timing === "research" ? "low" : "normal";

  if (a.project === "service") {
    return {
      title: "Stove servicing and parts",
      summary: "Our workshop replaces door seals, glass, grates and fire bricks and refurbishes doors for most makes of stove.",
      points: [
        "Have the make and model to hand. It's usually on a plate on the back or under the ash pan.",
        "A photo of the worn part, or the part itself, helps us match it first time.",
        "Get the chimney swept at least once a year, before the heating season.",
      ],
      links: [{ label: "Servicing & parts", href: "/servicing" }],
      priority: "normal",
    };
  }

  if (a.project === "outdoor") {
    return {
      title: "Outdoor heating",
      summary: "Fire pits, garden stoves and kamado barbecues for patios and gardens.",
      points: [
        "Keep outdoor fires on a stable, non-combustible base, clear of fences, sheds and overhanging trees.",
        "Burn dry, seasoned wood or charcoal for clean flames and less smoke.",
      ],
      links: [
        { label: "BBQ & Outdoor range", href: "/range/bbq-outdoor" },
        { label: "Special offers", href: "/shop" },
      ],
      priority,
    };
  }

  const points: string[] = [];
  const links: Recommendation["links"] = [];
  let fuel = a.fuel ?? "unsure";

  // Steer the fuel where the house rules some options out.
  if (a.home === "apartment" && (fuel === "wood" || fuel === "pellet" || fuel === "unsure")) {
    if (fuel !== "unsure") points.push("Most apartments can't take a flue, so wood and pellet stoves are rarely an option. Electric fires need no flue or ventilation.");
    fuel = "electric";
  }
  if (a.home === "nochimney" && fuel === "unsure") {
    points.push("With no chimney, the simplest options are an electric fire or a balanced-flue gas fire. A stove is still possible with a twin-wall flue system.");
  }

  switch (fuel) {
    case "wood":
      links.push({ label: "Stoves", href: "/range/stoves" });
      points.push("Burn only dry, seasoned or kiln-dried wood (ideally under 20% moisture) or approved smokeless fuel.");
      points.push("New solid-fuel stoves sold in the EU since 2022 must meet Ecodesign limits for efficiency and emissions.");
      break;
    case "gas":
      links.push({ label: "Gas fires", href: "/range/gas-fires" });
      points.push("All gas installations in Ireland must be carried out by a Registered Gas Installer (RGI).");
      if (a.home === "nochimney" || a.home === "airtight") points.push("A balanced-flue gas fire vents straight through an outside wall, so no chimney is needed.");
      break;
    case "electric":
      links.push({ label: "Electric fires", href: "/range/electric-fires" });
      points.push("Electric fires need no flue or ventilation and can run the flame effect with or without heat.");
      break;
    case "pellet":
      links.push({ label: "Pellet stoves", href: "/range/pellet-stoves" });
      points.push("Pellet stoves need a power supply, a flue and dry storage for pellets. Some models also heat radiators.");
      break;
    default:
      links.push({ label: "Stoves", href: "/range/stoves" }, { label: "Gas fires", href: "/range/gas-fires" }, { label: "Electric fires", href: "/range/electric-fires" });
      points.push("We'll compare wood, gas, electric and pellet options with you in the showroom.");
  }

  if (a.home === "chimney" && (fuel === "wood" || fuel === "pellet" || fuel === "unsure")) {
    points.push("Have the chimney inspected and swept first. Many older chimneys need a stainless-steel liner for a stove to draw safely.");
  }
  if (a.home === "airtight" && fuel !== "electric") {
    points.push("In airtight homes, Building Regulations Part J generally call for a room-sealed appliance or a dedicated outside air supply.");
  }
  if (fuel !== "electric") {
    points.push("A carbon monoxide alarm is required when a new fuel-burning appliance is installed.");
  }
  if (a.project === "fireplace" || a.project === "replace") {
    links.push({ label: "Fireplaces", href: "/range/fireplaces" });
  }

  const output = a.room ? KW[a.room] : undefined;
  const fuelName: Record<string, string> = { wood: "wood or multi-fuel stove", gas: "gas fire", electric: "electric fire", pellet: "pellet stove", unsure: "fire or stove" };
  const what = a.project === "fireplace" ? "fireplace" : fuelName[fuel];
  const where = { chimney: "an older home with a chimney", airtight: "an airtight, newer home", nochimney: "a house with no chimney", apartment: "an apartment" }[a.home ?? ""] ?? "your home";

  return {
    title: `A ${what} for ${where}`,
    summary:
      output && a.room !== "open"
        ? `For a ${a.room} room, start looking at heat outputs of ${output}. A newer, well-insulated home usually sits at the lower end.`
        : `We'll calculate the output on survey: ${KW.open}.`,
    output,
    points,
    links,
    priority,
  };
}

/** One-line summary of the answers, used in the enquiry sent to the team. */
export function describeAnswers(a: Answers): string {
  return stepsFor(a)
    .filter((s) => a[s.id])
    .map((s) => `${s.question} ${labelFor(s.id, a[s.id])}`)
    .join(" · ");
}
