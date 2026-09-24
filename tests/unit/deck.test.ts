import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@/lib/config";
import { buildFilters, isHard } from "@/lib/deck/filters";
import {
  applyDiversity, buildBatch, cardBadges, COMPONENTS, explorationCount, matchReasons, scoreCar, weightAt, weightsAt,
  type ScoreContext,
} from "@/lib/deck/ranking";
import { looseningOptions, topLoosenings } from "@/lib/deck/rescue";
import { nextQuestion } from "@/lib/deck/progressive";
import type { Prefs } from "@/lib/types";
import { car } from "./helpers";

const W = DEFAULT_CONFIG.ranking_weights;

function ctx(overrides: Partial<ScoreContext> = {}): ScoreContext {
  return { prefs: {}, affinities: new Map(), swipes: 0, radiusMi: 40, maxPrice: 32000, config: DEFAULT_CONFIG, ...overrides };
}

// Seeded RNG so exploration picks are deterministic.
function rng(seed = 1) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

describe("ranking weights", () => {
  it("ramps from swipe 0 to swipe 50", () => {
    expect(weightAt("stated", 0, W)).toBeCloseTo(0.4);
    expect(weightAt("stated", 25, W)).toBeCloseTo(0.3);
    expect(weightAt("stated", 50, W)).toBeCloseTo(0.2);
    expect(weightAt("stated", 500, W)).toBeCloseTo(0.2);
    expect(weightAt("visual", 0, W)).toBeCloseTo(0.05);
    expect(weightAt("visual", 50, W)).toBeCloseTo(0.15);
    expect(weightAt("deal", 25, W)).toBeCloseTo(0.15);
  });

  it("sums to 1 at every point of the ramp", () => {
    for (const n of [0, 10, 25, 49, 50, 300]) {
      const total = COMPONENTS.reduce((s, c) => s + weightsAt(n, W)[c], 0);
      expect(total).toBeCloseTo(1, 6);
    }
  });

  it("scores every component between 0 and 1", () => {
    const s = scoreCar(car({ visual_sim: 0.9, deal_rating: "great" }), ctx());
    for (const c of COMPONENTS) {
      expect(s.components[c]).toBeGreaterThanOrEqual(0);
      expect(s.components[c]).toBeLessThanOrEqual(1);
    }
    expect(s.score).toBeGreaterThan(0);
    expect(s.score).toBeLessThanOrEqual(1);
  });

  it("prefers a great deal nearby over an overpriced far one", () => {
    const good = scoreCar(car({ deal_rating: "great", distance_mi: 3 }), ctx());
    const bad = scoreCar(car({ deal_rating: "overpriced", distance_mi: 38 }), ctx());
    expect(good.score).toBeGreaterThan(bad.score);
  });

  it("learns from affinities as swipes grow", () => {
    const affinities = new Map([["make:Honda", { attribute: "make:Honda", likes: 8, passes: 0 }]]);
    const honda = car({ make: "Honda", model: "CR-V", features: [] });
    const early = scoreCar(honda, ctx({ affinities, swipes: 0 })).contributions.affinity;
    const late = scoreCar(honda, ctx({ affinities, swipes: 50 })).contributions.affinity;
    expect(late).toBeGreaterThan(early);
  });
});

describe("exploration and diversity", () => {
  it("uses 15% of a 20-card batch, dropping to 8% after 300 swipes", () => {
    expect(explorationCount(0, DEFAULT_CONFIG.exploration)).toBe(3);
    expect(explorationCount(299, DEFAULT_CONFIG.exploration)).toBe(3);
    expect(explorationCount(300, DEFAULT_CONFIG.exploration)).toBe(2);
  });

  it("never puts the same make+model within 2 cards or the same seller back to back", () => {
    const items = [
      car({ make: "Ford", model: "F-150", dealership_id: "a" }),
      car({ make: "Ford", model: "F-150", dealership_id: "b" }),
      car({ make: "Honda", model: "Civic", dealership_id: "a" }),
      car({ make: "Kia", model: "Telluride", dealership_id: "a" }),
      car({ make: "Mazda", model: "CX-5", dealership_id: "d" }),
      car({ make: "Jeep", model: "Wrangler", dealership_id: "e" }),
    ].map((c) => ({ car: c }));
    const out = applyDiversity(items);
    expect(out).toHaveLength(items.length);
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j <= i + 2 && j < out.length; j++) {
        expect(`${out[i].car.make} ${out[i].car.model}`).not.toBe(`${out[j].car.make} ${out[j].car.model}`);
      }
      if (i > 0) expect(out[i].car.dealership_id).not.toBe(out[i - 1].car.dealership_id);
    }
  });

  it("still returns every card when diversity is impossible", () => {
    const items = Array.from({ length: 4 }, () => ({ car: car({ make: "Ford", model: "F-150", dealership_id: "a" }) }));
    expect(applyDiversity(items)).toHaveLength(4);
  });

  it("builds a 20-card batch with exploration cards that never sit first", () => {
    const makes = ["Toyota", "Honda", "Ford", "Kia", "Mazda", "Subaru", "Hyundai", "Chevrolet", "Jeep", "Nissan"];
    const candidates = Array.from({ length: 60 }, (_, i) =>
      car({ make: makes[i % 10], model: `M${i % 7}`, is_exploration: i >= 45, dealership_id: `d${i % 9}`, deal_rating: i % 3 ? "good" : "great" }));
    const batch = buildBatch(candidates, ctx(), rng(7));
    expect(batch).toHaveLength(20);
    expect(batch.filter((b) => b.exploration)).toHaveLength(3);
    expect(batch[0].exploration).toBe(false);
    expect(new Set(batch.map((b) => b.car.id)).size).toBe(20);
  });
});

describe("match reasons and badges", () => {
  it("returns at most 3 plain-English reasons, including the market delta", () => {
    const s = scoreCar(car({ deal_rating: "great", expected_price: 27900, price: 26000, distance_mi: 4, days_on_market: 2 }), ctx());
    const reasons = matchReasons(s, ctx());
    expect(reasons.length).toBeGreaterThan(0);
    expect(reasons.length).toBeLessThanOrEqual(3);
    expect(reasons.map((r) => r.text)).toContain("Great deal: $1,900 below market");
  });

  it("flags an unconfirmed must-have feature", () => {
    const prefs: Prefs = { "feature:carplay": { value: true, tier: "must", source: "said" } };
    const s = scoreCar(car({ features: [], features_verified: false }), ctx({ prefs }));
    expect(cardBadges(s, prefs).map((b) => b.text)).toContain("Apple CarPlay not confirmed");
  });

  it("shows 'History not reported' when accidents are unknown", () => {
    const prefs: Prefs = { no_accidents: { value: true, tier: "dealbreaker", source: "said" } };
    const s = scoreCar(car({ accident_count: null }), ctx({ prefs }));
    expect(cardBadges(s, prefs).map((b) => b.kind)).toContain("history_not_reported");
  });
});

describe("hard filters", () => {
  const prefs: Prefs = {
    body_styles: { value: ["compact_suv"], tier: "must", source: "said" },
    towing_min: { value: 5000, tier: "must", source: "life" },
    colors: { value: ["blue"], tier: "nice", source: "said" },
    clean_title: { value: true, tier: "dealbreaker", source: "said" },
    brands_exclude: { value: ["Nissan"], tier: "dealbreaker", source: "said" },
    "feature:carplay": { value: true, tier: "must", source: "said" },
    "feature:sunroof": { value: true, tier: "nice", source: "swiped" },
    fuel_types: { value: ["electric"], tier: "dont_care", source: "said" },
  };

  it("makes dealbreakers and reliable must-haves hard, everything else soft", () => {
    expect(isHard("clean_title", prefs.clean_title)).toBe(true);
    expect(isHard("body_styles", prefs.body_styles)).toBe(true);
    expect(isHard("towing_min", prefs.towing_min)).toBe(false); // towing data is unreliable
    expect(isHard("colors", prefs.colors)).toBe(false);
    expect(isHard("fuel_types", prefs.fuel_types)).toBe(false);
  });

  it("builds the SQL filter object", () => {
    const f = buildFilters({ prefs, origin: { lat: 36.1, lng: -86.7 }, radiusMi: 40, maxPrice: 30000, excludeIds: ["x"] });
    expect(f).toEqual({
      lat: 36.1, lng: -86.7, radius_mi: 40, max_price: 30000,
      body_styles: ["compact_suv"], exclude_makes: ["Nissan"], require_clean_title: true,
      require_features: ["carplay"], exclude_ids: ["x"],
    });
  });

  it("turns excluded body styles into an include list", () => {
    const f = buildFilters({
      prefs: { body_styles_exclude: { value: ["sedan"], tier: "must", source: "swiped" } },
      origin: { lat: 0, lng: 0 }, radiusMi: 25, maxPrice: null,
    });
    expect(f.body_styles).not.toContain("sedan");
    expect(f.body_styles).toContain("pickup");
  });
});

describe("empty-deck rescue", () => {
  it("never offers to loosen a dealbreaker", () => {
    const prefs: Prefs = {
      budget_mode: { value: "monthly", tier: "must", source: "said" },
      max_monthly_payment: { value: 440, tier: "must", source: "said" },
      year_range: { value: { min: 2019 }, tier: "dealbreaker", source: "said" },
      body_styles: { value: ["compact_suv"], tier: "must", source: "said" },
      clean_title: { value: true, tier: "dealbreaker", source: "said" },
    };
    const ids = looseningOptions(prefs, 25).map((o) => o.id);
    expect(ids).toContain("radius:40");
    expect(ids).toContain("monthly:480");
    expect(ids).toContain("body:midsize_suv");
    expect(ids.some((id) => id.startsWith("year:"))).toBe(false);
  });

  it("keeps the top three that add cars", () => {
    const opts = looseningOptions({}, 25).concat(looseningOptions({}, 40));
    const top = topLoosenings(opts.map((o, i) => ({ option: o, gain: i === 0 ? 0 : 10 * i })));
    expect(top.every((t) => t.gain > 0)).toBe(true);
    expect(top.length).toBeLessThanOrEqual(3);
  });
});

describe("progressive profiling", () => {
  it("asks to stop showing sedans after 5 passes, at most once per 20 swipes", () => {
    const affinities = [{ attribute: "body:sedan", likes: 0, passes: 2.5 }];
    const base = { affinities, prefs: {}, dismissed: [], every: 20 };
    expect(nextQuestion({ ...base, swipes: 25, lastQuestionSwipe: 0 })?.text).toBe("Should I stop showing sedans?");
    expect(nextQuestion({ ...base, swipes: 25, lastQuestionSwipe: 10 })).toBeNull();
    expect(nextQuestion({ ...base, swipes: 25, lastQuestionSwipe: 0, dismissed: ["stop_body:sedan"] })).toBeNull();
  });

  it("asks whether a repeatedly liked feature is a must-have", () => {
    const q = nextQuestion({
      swipes: 30, lastQuestionSwipe: 0, every: 20, prefs: {}, dismissed: [],
      affinities: [{ attribute: "feature:sunroof", likes: 3, passes: 0.5 }],
    });
    expect(q?.text).toContain("sunroof");
    expect(q?.options[0].set).toMatchObject({ key: "feature:sunroof", tier: "must" });
  });
});
