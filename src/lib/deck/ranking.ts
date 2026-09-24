// Pass 2 of the deck: soft score, exploration, diversity and match reasons.
//
//   score(car) = sum_i w_i(n) * s_i(car)
//   w_i(n)     = w_i^0 + (w_i^50 - w_i^0) * min(n / 50, 1)
//
// Each component scores the car from 0 to 1. Weights live in app_config.

import type { AppConfig, RankingComponent } from "../config";
import { marketDeltaText } from "../deal";
import { featureLabel } from "../criteria/features";
import { isHard } from "./filters";
import { BODY_LABEL, DRIVE_LABEL, FUEL_LABEL, type Affinity, type Badge, type DeckCandidate, type MatchReason, type Prefs } from "../types";

export const COMPONENTS: RankingComponent[] = [
  "stated", "affinity", "visual", "deal", "distance", "freshness", "quality", "headroom", "matchability",
];

export function weightAt(component: RankingComponent, swipes: number, cfg: AppConfig["ranking_weights"]): number {
  const w = cfg.components[component];
  const t = Math.min(Math.max(swipes, 0) / cfg.ramp_swipes, 1);
  return w.w0 + (w.w50 - w.w0) * t;
}

export function weightsAt(swipes: number, cfg: AppConfig["ranking_weights"]): Record<RankingComponent, number> {
  return Object.fromEntries(COMPONENTS.map((c) => [c, weightAt(c, swipes, cfg)])) as Record<RankingComponent, number>;
}

// Stated preferences ----------------------------------------------------------

export interface StatedCheck {
  key: string;
  label: string;
  /** true = has it, false = doesn't, null = data not reported. */
  matched: boolean | null;
  weight: number;
  must: boolean;
}

const combinedMpg = (c: DeckCandidate) =>
  c.mpg_city && c.mpg_hwy ? 0.55 * c.mpg_city + 0.45 * c.mpg_hwy : null;

/** Soft checks: Nice-to-haves plus Must-haves that SQL could not enforce. */
export function statedChecks(car: DeckCandidate, prefs: Prefs): StatedCheck[] {
  const checks: StatedCheck[] = [];
  const add = (key: string, label: string, matched: boolean | null) => {
    const p = prefs[key];
    const must = p.tier === "must" || p.tier === "dealbreaker";
    checks.push({ key, label, matched, weight: must ? 2 : 1, must });
  };
  for (const [key, pref] of Object.entries(prefs)) {
    if (pref.tier === "dont_care" || pref.value === null || pref.value === undefined || pref.value === false) continue;
    // Hard filters already guaranteed a match; skip them (features are still
    // checked because unverified listings pass the SQL gate).
    if (isHard(key, pref) && !key.startsWith("feature:") && key !== "third_row" && key !== "towing_min") continue;
    const v = pref.value;
    const list = Array.isArray(v) ? v.map(String) : null;
    switch (key) {
      case "makes":
        if (list) add(key, list.length === 1 ? `${list[0]}` : "A make you like", list.includes(car.make));
        break;
      case "models":
        if (list) add(key, `${car.model}`, list.some((m) => m === car.model || m === `${car.make} ${car.model}`));
        break;
      case "body_styles":
        if (list) add(key, BODY_LABEL[car.body_style], list.includes(car.body_style));
        break;
      case "condition":
        if (list) add(key, car.condition === "cpo" ? "Certified" : car.condition === "new" ? "New" : "Used", list.includes(car.condition));
        break;
      case "fuel_types":
        if (list) add(key, FUEL_LABEL[car.fuel_type], list.includes(car.fuel_type));
        break;
      case "drivetrains":
        if (list) add(key, car.drivetrain ? DRIVE_LABEL[car.drivetrain] : "Drivetrain", car.drivetrain ? list.includes(car.drivetrain) : null);
        break;
      case "colors":
        if (list) add(key, `${car.exterior_color ?? "Color"}`, car.exterior_color_family ? list.includes(car.exterior_color_family) : null);
        break;
      case "interior_material":
        if (list) add(key, car.interior_material === "leather" ? "Leather interior" : "Interior", car.interior_material ? list.includes(car.interior_material) : null);
        break;
      case "min_seats":
        add(key, `${car.seats ?? "?"} seats`, car.seats === null ? null : car.seats >= Number(v));
        break;
      case "third_row":
        add(key, "Third row", car.third_row);
        break;
      case "mpg_min": {
        const mpg = combinedMpg(car);
        add(key, mpg ? `${Math.round(mpg)} mpg` : "Fuel economy", car.fuel_type === "electric" ? true : mpg === null ? null : mpg >= Number(v));
        break;
      }
      case "towing_min":
        add(key, car.towing_lbs ? `Tows ${car.towing_lbs.toLocaleString("en-US")} lb` : "Towing", car.towing_lbs === null ? null : car.towing_lbs >= Number(v));
        break;
      case "ev_range":
        if (car.fuel_type === "electric") add(key, `${car.ev_range_mi ?? "?"} mi range`, car.ev_range_mi === null ? null : car.ev_range_mi >= Number(v));
        break;
      case "max_mileage":
        add(key, "Under your mileage cap", car.miles <= Number(v));
        break;
      case "year_range": {
        const r = v as { min?: number; max?: number };
        add(key, `${car.year}`, (!r.min || car.year >= r.min) && (!r.max || car.year <= r.max));
        break;
      }
      case "deal_rating": {
        const order = ["great", "good", "fair", "high", "overpriced"];
        add(key, "Deal quality", car.deal_rating ? order.indexOf(car.deal_rating) <= order.indexOf(String(v)) : null);
        break;
      }
      case "no_open_recalls":
        add(key, "No open recalls", car.open_recalls === null ? null : car.open_recalls === 0);
        break;
      case "personal_use":
        add(key, "Personal use only", car.personal_use);
        break;
      case "max_owners":
        add(key, car.owner_count === 1 ? "One owner" : "Owner count", car.owner_count === null ? null : car.owner_count <= Number(v));
        break;
      case "eco_priority":
        add(key, "Efficient", ["hybrid", "plugin_hybrid", "electric"].includes(car.fuel_type) || (combinedMpg(car) ?? 0) >= 33);
        break;
      case "pet_friendly":
        add(key, "Room for the dog", ["compact_suv", "midsize_suv", "three_row_suv", "wagon", "minivan", "pickup"].includes(car.body_style) || car.features.includes("washable_interior"));
        break;
      case "cargo_space":
        add(key, "Cargo room", ["three_row_suv", "minivan", "wagon", "pickup", "midsize_suv"].includes(car.body_style));
        break;
      case "ground_clearance":
        add(key, "Ground clearance", ["midsize_suv", "pickup", "three_row_suv"].includes(car.body_style) || car.features.includes("off_road_package"));
        break;
      case "easy_entry":
        add(key, "Easy entry", ["compact_suv", "midsize_suv", "three_row_suv", "minivan"].includes(car.body_style));
        break;
      case "car_seats":
        add(key, "Fits the car seats", car.seats === null ? null : car.seats >= Number(v) + 2);
        break;
      default:
        if (key.startsWith("feature:") && v === true) {
          const f = key.slice("feature:".length);
          add(key, featureLabel(f), car.features.includes(f) ? true : car.features_verified ? false : null);
        }
    }
  }
  return checks;
}

export function statedScore(checks: StatedCheck[]): number {
  if (!checks.length) return 0.5;
  let num = 0;
  let den = 0;
  for (const c of checks) {
    num += c.weight * (c.matched === true ? 1 : c.matched === null ? 0.5 : 0);
    den += c.weight;
  }
  return num / den;
}

// Learned affinity --------------------------------------------------------------

export function carAttributes(car: Pick<DeckCandidate, "make" | "model" | "body_style" | "exterior_color_family" | "fuel_type" | "drivetrain" | "condition" | "interior_material" | "features">): string[] {
  const attrs = [
    `make:${car.make}`,
    `model:${car.make} ${car.model}`,
    `body:${car.body_style}`,
    car.exterior_color_family ? `color:${car.exterior_color_family}` : null,
    `fuel:${car.fuel_type}`,
    car.drivetrain ? `drive:${car.drivetrain}` : null,
    `condition:${car.condition}`,
    car.interior_material ? `interior:${car.interior_material}` : null,
    ...car.features.map((f) => `feature:${f}`),
  ];
  return attrs.filter((a): a is string => a !== null);
}

/** Laplace-smoothed like rate per attribute, weighted by evidence. 0.5 = no signal. */
export function affinityScore(car: DeckCandidate, affinities: Map<string, Affinity>): { score: number; best: Affinity | null } {
  let num = 0;
  let den = 0;
  let best: Affinity | null = null;
  let bestRate = 0;
  for (const attr of carAttributes(car)) {
    const a = affinities.get(attr);
    if (!a) continue;
    const evidence = a.likes + a.passes;
    const conf = Math.min(1, evidence / 5);
    if (conf === 0) continue;
    const rate = (a.likes + 1) / (evidence + 2);
    // Features are numerous; weight make/model/body/color more heavily.
    const w = attr.startsWith("feature:") ? conf * 0.4 : conf;
    num += w * rate;
    den += w;
    if (!attr.startsWith("feature:") && a.likes >= 2 && rate > bestRate) {
      bestRate = rate;
      best = a;
    }
  }
  return { score: den === 0 ? 0.5 : num / den, best: bestRate >= 0.65 ? best : null };
}

/** How little we know about this car's attributes (for exploration picks). */
export function uncertainty(car: DeckCandidate, affinities: Map<string, Affinity>): number {
  const core = carAttributes(car).filter((a) => !a.startsWith("feature:"));
  const known = core.map((a) => Math.min(1, ((affinities.get(a)?.likes ?? 0) + (affinities.get(a)?.passes ?? 0)) / 5));
  return 1 - known.reduce((s, x) => s + x, 0) / Math.max(core.length, 1);
}

// Other components -------------------------------------------------------------

const DEAL_SCORE: Record<string, number> = { great: 1, good: 0.8, fair: 0.55, high: 0.3, overpriced: 0.1 };

export interface ScoreContext {
  prefs: Prefs;
  affinities: Map<string, Affinity>;
  swipes: number;
  radiusMi: number;
  maxPrice: number | null;
  config: AppConfig;
}

export interface Scored {
  car: DeckCandidate;
  score: number;
  components: Record<RankingComponent, number>;
  contributions: Record<RankingComponent, number>;
  checks: StatedCheck[];
  bestAffinity: Affinity | null;
}

export function scoreCar(car: DeckCandidate, ctx: ScoreContext): Scored {
  const checks = statedChecks(car, ctx.prefs);
  const aff = affinityScore(car, ctx.affinities);
  const priceDrop = car.last_price_drop && car.last_price_drop > 0 ? 0.2 : 0;
  const components: Record<RankingComponent, number> = {
    stated: statedScore(checks),
    affinity: aff.score,
    visual: car.visual_sim === null ? 0.5 : Math.min(1, Math.max(0, (car.visual_sim + 1) / 2)),
    deal: car.deal_rating ? DEAL_SCORE[car.deal_rating] : 0.45,
    distance: Math.min(1, Math.max(0, 1 - car.distance_mi / Math.max(ctx.radiusMi, 1))),
    freshness: Math.min(1, 0.8 * Math.exp(-car.days_on_market / 30) + priceDrop),
    quality: car.quality_score ?? Math.min(1, 0.3 + car.photo_count * 0.08),
    headroom: ctx.maxPrice ? Math.min(1, Math.max(0, (ctx.maxPrice - car.price) / ctx.maxPrice / 0.25)) : 0.5,
    matchability: car.seller_type === "private" ? 0.3
      : car.dealer_lead_channel === "inbox" ? 1 : car.dealer_lead_channel === "email" ? 0.7 : 0.2,
  };
  const weights = weightsAt(ctx.swipes, ctx.config.ranking_weights);
  const contributions = Object.fromEntries(COMPONENTS.map((c) => [c, weights[c] * components[c]])) as Record<RankingComponent, number>;
  const score = COMPONENTS.reduce((s, c) => s + contributions[c], 0);
  return { car, score, components, contributions, checks, bestAffinity: aff.best };
}

// Match reasons -----------------------------------------------------------------

/** The top 3 score contributions above neutral, in plain English. */
export function matchReasons(s: Scored, ctx: ScoreContext): MatchReason[] {
  const weights = weightsAt(ctx.swipes, ctx.config.ranking_weights);
  const candidates: { key: string; strength: number; text: string }[] = [];
  const car = s.car;

  const matchedMust = s.checks.find((c) => c.must && c.matched === true && c.key.startsWith("feature:"));
  const matchedNice = s.checks.filter((c) => c.matched === true);
  if (matchedMust) {
    candidates.push({ key: "stated", strength: weights.stated * (s.components.stated - 0.4) + 0.05, text: `Has ${matchedMust.label} (must-have)` });
  } else if (matchedNice.length) {
    const top = matchedNice.sort((a, b) => b.weight - a.weight)[0];
    candidates.push({ key: "stated", strength: weights.stated * (s.components.stated - 0.5), text: matchedNice.length > 1 ? `${top.label} + ${matchedNice.length - 1} more you want` : `${top.label}, like you said` });
  }
  const delta = marketDeltaText(car.price, car.expected_price);
  if (car.deal_rating === "great" || car.deal_rating === "good") {
    candidates.push({ key: "deal", strength: weights.deal * (s.components.deal - 0.5), text: `${car.deal_rating === "great" ? "Great" : "Good"} deal${delta ? `: ${delta}` : ""}` });
  }
  if (car.distance_mi <= Math.max(10, ctx.radiusMi * 0.35)) {
    candidates.push({ key: "distance", strength: weights.distance * (s.components.distance - 0.5), text: `${Math.max(1, Math.round(car.distance_mi))} mi away` });
  }
  if (car.visual_sim !== null && s.components.visual > 0.8) {
    candidates.push({ key: "visual", strength: weights.visual * (s.components.visual - 0.5), text: "Matches your style" });
  }
  if (s.bestAffinity) {
    const [kind, value] = s.bestAffinity.attribute.split(":");
    const text = kind === "make" ? `You like ${value}s`
      : kind === "model" ? `Like the ${value.split(" ").slice(1).join(" ")}s you liked`
      : kind === "body" ? `More ${BODY_LABEL[value as keyof typeof BODY_LABEL] ?? value}s like you liked`
      : kind === "color" ? `A ${value} one, your pattern`
      : kind === "feature" ? `Has ${featureLabel(value)}, which you keep liking`
      : `Fits your swipes`;
    candidates.push({ key: "affinity", strength: weights.affinity * (s.components.affinity - 0.5), text });
  }
  if (car.last_price_drop && car.last_price_drop >= 300) {
    candidates.push({ key: "freshness", strength: weights.freshness * 0.5, text: `Price dropped $${Math.round(car.last_price_drop).toLocaleString("en-US")}` });
  } else if (car.days_on_market <= 5) {
    candidates.push({ key: "freshness", strength: weights.freshness * (s.components.freshness - 0.5), text: "New this week" });
  }
  if (ctx.maxPrice && ctx.maxPrice - car.price >= 2000) {
    candidates.push({ key: "headroom", strength: weights.headroom * (s.components.headroom - 0.5), text: `$${(Math.floor((ctx.maxPrice - car.price) / 100) * 100).toLocaleString("en-US")} under budget` });
  }
  if (car.dealer_lead_channel === "inbox" && (car.dealer_response_minutes ?? 999) <= 60) {
    candidates.push({ key: "matchability", strength: weights.matchability * 0.4, text: "Dealer replies fast" });
  }
  return candidates
    .filter((c) => c.strength > 0)
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 3)
    .map(({ key, text }) => ({ key, text }));
}

/** "Not confirmed" style badges for unconfirmed musts and unreported history. */
export function cardBadges(s: Scored, prefs: Prefs): Badge[] {
  const badges: Badge[] = [];
  for (const c of s.checks) {
    if (c.must && c.matched === null) badges.push({ kind: "not_confirmed", text: `${c.label} not confirmed` });
  }
  if (s.car.title_status === null && prefs.clean_title?.value === true) badges.push({ kind: "title_not_reported", text: "Title not reported" });
  if (s.car.accident_count === null && prefs.no_accidents?.value === true) badges.push({ kind: "history_not_reported", text: "History not reported" });
  // Paid placement is always disclosed, so it is never trimmed.
  return s.car.is_promoted ? [{ kind: "promoted", text: "Promoted" }, ...badges.slice(0, 2)] : badges.slice(0, 3);
}

// Batch assembly ----------------------------------------------------------------

export function explorationCount(swipes: number, cfg: AppConfig["exploration"]): number {
  const rate = swipes >= cfg.after_swipes ? cfg.rate_after : cfg.rate_start;
  return Math.round(cfg.batch_size * rate);
}

/**
 * Reorder so the same make+model never appears within 2 cards and the same
 * seller never appears back to back, keeping score order where possible.
 * Exploration cards never sit first.
 */
export function applyDiversity<T extends { car: DeckCandidate; exploration?: boolean }>(items: T[]): T[] {
  const remaining = [...items];
  const out: T[] = [];
  while (remaining.length) {
    const idx = remaining.findIndex((item) => {
      if (out.length === 0 && item.exploration) return false;
      const key = `${item.car.make}|${item.car.model}`;
      const recent = out.slice(-2);
      if (recent.some((r) => `${r.car.make}|${r.car.model}` === key)) return false;
      const prev = out[out.length - 1];
      if (prev && item.car.dealership_id && prev.car.dealership_id === item.car.dealership_id) return false;
      return true;
    });
    const take = idx === -1 ? (out.length === 0 ? Math.max(0, remaining.findIndex((r) => !r.exploration)) : 0) : idx;
    out.push(remaining.splice(take, 1)[0]);
  }
  return out;
}

export interface BatchItem extends Scored {
  exploration: boolean;
}

/** top_by_score(17) + explore_picks(3), then diversity. */
export function buildBatch(candidates: DeckCandidate[], ctx: ScoreContext, rng: () => number = Math.random): BatchItem[] {
  const size = ctx.config.exploration.batch_size;
  const nExplore = explorationCount(ctx.swipes, ctx.config.exploration);
  const scored = candidates.map((c) => scoreCar(c, ctx));
  // Paid placement: a small boost for at most max_share of the batch. Every
  // promoted card carries a "Promoted" label (see cardBadges).
  const promoCap = Math.max(1, Math.floor(size * ctx.config.promotions.max_share));
  scored.filter((s) => s.car.is_promoted).sort((a, b) => b.score - a.score).slice(0, promoCap)
    .forEach((s) => { s.score = Math.min(1, s.score + ctx.config.promotions.boost); });
  const main = scored.filter((s) => !s.car.is_exploration).sort((a, b) => b.score - a.score);
  const explorePool = scored
    .filter((s) => s.car.is_exploration)
    .map((s) => ({ s, u: uncertainty(s.car, ctx.affinities) + rng() * 0.2 }))
    .sort((a, b) => b.u - a.u)
    .map((x) => x.s);

  const explore = explorePool.slice(0, nExplore);
  const top = main.slice(0, size - explore.length);
  // Backfill from whichever pool has cars left if one runs short.
  const used = new Set([...top, ...explore].map((s) => s.car.id));
  const backfill = [...main, ...explorePool].filter((s) => !used.has(s.car.id)).slice(0, Math.max(0, size - top.length - explore.length));

  const items: BatchItem[] = [
    ...[...top, ...backfill].map((s) => ({ ...s, exploration: false })),
    ...explore.map((s) => ({ ...s, exploration: true })),
  ];
  // Interleave exploration cards through the batch rather than at the end.
  const ordered = [...items].sort((a, b) => b.score - a.score);
  const nonExplore = ordered.filter((i) => !i.exploration);
  const exploreItems = ordered.filter((i) => i.exploration);
  const merged: BatchItem[] = [];
  const gap = exploreItems.length ? Math.max(2, Math.floor(nonExplore.length / exploreItems.length)) : Infinity;
  let e = 0;
  nonExplore.forEach((item, i) => {
    merged.push(item);
    if ((i + 1) % gap === 0 && e < exploreItems.length) merged.push(exploreItems[e++]);
  });
  while (e < exploreItems.length) merged.push(exploreItems[e++]);
  return applyDiversity(merged);
}
