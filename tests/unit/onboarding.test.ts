import { describe, expect, it } from "vitest";
import { extractFromChip, extractFromText, mergeExtractions } from "@/lib/onboarding/extract";
import { nextSlot, progress, type OnboardingState } from "@/lib/onboarding/slots";
import { ALLOWED_SOURCES, sanitizeClaims, templateBrief } from "@/lib/brief/template";
import { DEFAULT_CONFIG } from "@/lib/config";
import { car } from "./helpers";

// Fixed transcripts: the rule-based extractor must pull these fields.
describe("onboarding extraction (fixed transcripts)", () => {
  it("family with a dog, lake weekends and a monthly budget", () => {
    const x = extractFromText(
      "I'm Jordan. Two kids in car seats and a golden retriever. We go to the lake most weekends and I commute on I-65. " +
      "Looking for a used SUV around $500/mo with $3,000 down. I'll trade in my 2016 Honda Civic, probably worth $12k and I owe about 4k. Hoping to buy this month. 37206",
      "life",
    );
    expect(x.profile).toMatchObject({ first_name: "Jordan", zip: "37206" });
    expect(x.prefs.budget_mode.value).toBe("monthly");
    expect(x.prefs.max_monthly_payment.value).toBe(500);
    expect(x.prefs.down_payment.value).toBe(3000);
    expect(x.prefs.condition.value).toEqual(["used", "cpo"]);
    expect(x.prefs.body_styles.value).toEqual(["compact_suv", "midsize_suv"]);
    expect(x.prefs.min_seats.value).toBe(5);
    expect(x.prefs.car_seats.value).toBe(2);
    expect(x.prefs.pet_friendly.value).toBe(true);
    expect(x.prefs.drivetrains.value).toEqual(["awd", "4wd"]);
    expect(x.prefs.life_commute.value).toBe(true);
    expect(x.prefs.trade_in.value).toMatchObject({ has: true, value: 12000, payoff: 4000, description: "2016 Honda Civic" });
    expect(x.prefs.timeline.value).toBe("month");
    expect(x.prefs.min_seats.source).toBe("life");
    expect(x.facts).toContain("Has a dog");
  });

  it("truck buyer who tows, with cash budget and brand exclusions", () => {
    const x = extractFromText("Need a 4x4 truck that can tow our camper. Cash budget under $45,000. No Nissan. Clean title only, no accidents.");
    expect(x.prefs.body_styles.value).toEqual(["pickup"]);
    expect(x.prefs.drivetrains.value).toEqual(["4wd"]);
    expect(x.prefs.towing_min.value).toBe(7000);
    expect(x.prefs.budget_mode.value).toBe("cash");
    expect(x.prefs.max_cash_price.value).toBe(45000);
    expect(x.prefs.brands_exclude.value).toEqual(["Nissan"]);
    expect(x.prefs.clean_title).toMatchObject({ value: true, tier: "dealbreaker" });
    expect(x.prefs.no_accidents).toMatchObject({ value: true, tier: "dealbreaker" });
  });

  it("commuter who wants an efficient car with must-have CarPlay", () => {
    const x = extractFromText("Mostly highway driving, 60 miles a day. Want a hybrid or electric sedan. Must have Apple CarPlay. Just browsing for now.");
    expect(x.prefs.fuel_types.value).toEqual(["electric", "hybrid"]);
    expect(x.prefs.body_styles.value).toEqual(["sedan"]);
    expect(x.prefs["feature:carplay"]).toMatchObject({ value: true, tier: "must" });
    expect(x.prefs.timeline.value).toBe("browsing");
    expect(x.prefs.mpg_min.value).toBe(30);
    expect(x.profile.radius_mi).toBeUndefined();
  });

  it("first car for a teen", () => {
    const x = extractFromText("Buying a first car for my 16-year-old. Safe, reliable, under $15k.");
    expect(x.prefs["feature:auto_emergency_braking"]).toMatchObject({ value: true, tier: "must" });
    expect(x.prefs.max_cash_price.value).toBe(15000);
  });
});

describe("onboarding chips and slots", () => {
  it("maps chips to preferences", () => {
    expect(extractFromChip("budget", "monthly:450").prefs.max_monthly_payment.value).toBe(450);
    expect(extractFromChip("budget", "cash:25000").prefs.budget_mode.value).toBe("cash");
    expect(extractFromChip("seats", "7").prefs.third_row.value).toBe(true);
    expect(extractFromChip("history", "both").prefs.no_accidents.tier).toBe("dealbreaker");
    expect(extractFromChip("location", "37215").profile.zip).toBe("37215");
    expect(extractFromChip("location", "40").profile.radius_mi).toBe(40);
  });

  it("asks only for gaps, in order", () => {
    const x = mergeExtractions(extractFromText("Used SUV around $500/mo, trading in my car, this month", "life"), extractFromChip("location", "37206"));
    const state: OnboardingState = { prefs: x.prefs as OnboardingState["prefs"], zip: "37206", radiusSet: false, tasteDone: false, answered: [] };
    expect(nextSlot(state)?.id).toBe("location");
    state.radiusSet = true;
    expect(nextSlot(state)?.id).toBe("seats");
    expect(progress(state)).toBeGreaterThan(0.4);
  });
});

describe("car brief template", () => {
  it("only cites allowed sources and caps list lengths", () => {
    const b = templateBrief(
      car({ accident_count: 1, days_on_market: 58, expected_price: 27900, price: 26000, third_row: true, seats: 7 }),
      { third_row: { value: true, tier: "must", source: "life" }, life_offroad: { value: true, tier: "nice", source: "life" } },
      DEFAULT_CONFIG, 2026,
    );
    expect(b.fits.length).toBeLessThanOrEqual(3);
    expect(b.watchOuts.length).toBeLessThanOrEqual(3);
    for (const c of [...b.fits, ...b.watchOuts]) expect(ALLOWED_SOURCES.has(c.source)).toBe(true);
    expect(b.watchOuts.map((w) => w.text)).toContain("One reported accident");
    expect(b.fits.map((f) => f.text)).toContain("Third row for the kids");
    expect(b.costLine).toMatch(/^Est\. cost to own: about \$[\d,]+\/mo/);
  });

  it("drops AI claims that cite unknown sources", () => {
    const kept = sanitizeClaims([
      { text: "Clean history", source: "accident_count" },
      { text: "Best in class safety", source: "vibes" },
      { text: "Cheap", source: "market" },
    ], 3);
    expect(kept.map((k) => k.text)).toEqual(["Clean history", "Cheap"]);
  });
});
