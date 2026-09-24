// The AI Car Brief shape, its template fallback, and the source guardrail.
// "Why it fits you" (3 reasons), "Watch out for" (up to 3), cost-to-own line.
// Every claim cites the field it came from; unsourced claims are dropped.

import type { AppConfig } from "../config";
import { marketDeltaText } from "../deal";
import { featureLabel } from "../criteria/features";
import { statedChecks } from "../deck/ranking";
import { costForCar, costToOwn, budgetFromPrefs, type CostToOwn } from "../money";
import { BODY_LABEL, DRIVE_LABEL, type DeckCandidate, type Prefs } from "../types";

export interface BriefClaim {
  text: string;
  /** Field(s) the claim is based on, e.g. "accident_count" or "market". */
  source: string;
}

export interface CarBrief {
  fits: BriefClaim[];
  watchOuts: BriefClaim[];
  costToOwn: CostToOwn;
  costLine: string;
  generatedBy: "ai" | "template";
}

export const BRIEF_DISCLAIMER =
  "AI-written estimate from listing data. Not an inspection. Payment, deal rating and cost to own are estimates, not credit offers.";

/** Sources the AI may cite. Anything else is dropped by sanitizeClaims(). */
export const ALLOWED_SOURCES = new Set([
  "price", "expected_price", "deal_rating", "market", "miles", "year", "make", "model", "trim_level",
  "body_style", "condition", "exterior_color", "interior_material", "fuel_type", "drivetrain", "transmission",
  "engine", "horsepower", "mpg", "ev_range_mi", "seats", "third_row", "towing_lbs", "features",
  "features_verified", "title_status", "accident_count", "owner_count", "personal_use", "open_recalls",
  "recalls", "days_on_market", "last_price_drop", "distance_mi", "dealer", "profile", "cost_to_own",
]);

export function sanitizeClaims(claims: BriefClaim[] | undefined, max: number): BriefClaim[] {
  return (claims ?? [])
    .filter((c) => c && typeof c.text === "string" && c.text.trim().length > 0 && c.text.length <= 220)
    .filter((c) => String(c.source ?? "").split(/[,+ ]+/).filter(Boolean).every((s) => ALLOWED_SOURCES.has(s.trim())))
    .slice(0, max);
}

export function briefCost(car: DeckCandidate, prefs: Prefs, cfg: AppConfig, currentYear = new Date().getFullYear()): CostToOwn {
  const budget = budgetFromPrefs(prefs, cfg.finance);
  const cost = costForCar(car.price, car.condition, car.dealer_doc_fee, budget, cfg);
  return costToOwn({
    payment: budget.mode === "cash" ? 0 : cost.monthly,
    price: car.price,
    year: car.year,
    miles: car.miles,
    fuel: car.fuel_type,
    mpgCity: car.mpg_city,
    mpgHwy: car.mpg_hwy,
    bodyStyle: car.body_style,
    currentYear,
  }, cfg.cost_to_own);
}

export function costLine(c: CostToOwn): string {
  const parts = [c.payment > 0 ? "payment" : null, "insurance", "fuel", "upkeep"].filter(Boolean).join(", ");
  return `Est. cost to own: about $${c.total.toLocaleString("en-US")}/mo including ${parts}.`;
}

/** Template brief built only from listing fields. Used when AI is off or over budget. */
export function templateBrief(car: DeckCandidate, prefs: Prefs, cfg: AppConfig, currentYear = new Date().getFullYear()): CarBrief {
  const fits: BriefClaim[] = [];
  const watch: BriefClaim[] = [];
  const age = Math.max(1, currentYear - car.year);

  // Why it fits you
  const checks = statedChecks(car, prefs).filter((c) => c.matched === true).sort((a, b) => b.weight - a.weight);
  if (prefs.third_row?.value === true && car.third_row) fits.push({ text: "Third row for the kids", source: "third_row" });
  if (prefs.min_seats && car.seats && car.seats >= Number(prefs.min_seats.value)) {
    fits.push({ text: `Seats ${car.seats}, enough for everyone`, source: "seats" });
  }
  if ((prefs.life_offroad || prefs.life_weather) && car.drivetrain && ["awd", "4wd"].includes(car.drivetrain)) {
    fits.push({ text: `${DRIVE_LABEL[car.drivetrain]} for ${prefs.life_offroad ? "the lake roads" : "hills and ice"}`, source: "drivetrain" });
  }
  const delta = marketDeltaText(car.price, car.expected_price);
  if (delta && car.expected_price && car.price < car.expected_price) fits.push({ text: `${delta.replace("market", "similar local listings")}`, source: "market" });
  for (const c of checks) {
    if (c.key.startsWith("feature:")) fits.push({ text: `Has ${c.label}${c.must ? ", one of your must-haves" : ""}`, source: "features" });
  }
  if (car.owner_count === 1) fits.push({ text: "One owner", source: "owner_count" });
  if (car.condition !== "new" && car.miles < age * 9000) fits.push({ text: `Low miles for a ${car.year} (${car.miles.toLocaleString("en-US")})`, source: "miles" });
  if (prefs.life_commute && car.mpg_hwy && car.mpg_hwy >= 30) fits.push({ text: `${car.mpg_hwy} mpg highway for the commute`, source: "mpg" });
  if (prefs.life_towing && car.towing_lbs) fits.push({ text: `Rated to tow ${car.towing_lbs.toLocaleString("en-US")} lb`, source: "towing_lbs" });
  if (car.fuel_type === "electric" && car.ev_range_mi) fits.push({ text: `About ${car.ev_range_mi} mi of range`, source: "ev_range_mi" });
  if (fits.length < 3 && prefs.body_styles && (prefs.body_styles.value as string[]).includes(car.body_style)) {
    fits.push({ text: `The ${BODY_LABEL[car.body_style].toLowerCase()} shape you asked for`, source: "body_style" });
  }
  if (fits.length < 3 && car.distance_mi < 15) fits.push({ text: `Only ${Math.max(1, Math.round(car.distance_mi))} mi away`, source: "distance_mi" });

  // Watch out for
  if (car.accident_count && car.accident_count > 0) watch.push({ text: car.accident_count === 1 ? "One reported accident" : `${car.accident_count} reported accidents`, source: "accident_count" });
  if (car.title_status && car.title_status !== "clean") watch.push({ text: `${car.title_status[0].toUpperCase()}${car.title_status.slice(1)} title`, source: "title_status" });
  if (car.open_recalls && car.open_recalls > 0) watch.push({ text: `${car.open_recalls} open recall${car.open_recalls > 1 ? "s" : ""}; ask the dealer to confirm the fix`, source: "open_recalls" });
  if (car.condition !== "new" && car.miles >= 35000 && car.miles % 45000 >= 30000) watch.push({ text: "Tires may be due based on mileage", source: "miles" });
  if (car.condition !== "new" && car.miles > 100000) watch.push({ text: "Over 100k miles; budget for maintenance", source: "miles" });
  if (car.days_on_market >= 45) watch.push({ text: `${car.days_on_market} days on market, so there's room to negotiate`, source: "days_on_market" });
  if (car.deal_rating === "high" || car.deal_rating === "overpriced") {
    const above = marketDeltaText(car.price, car.expected_price);
    watch.push({ text: `Priced ${above ?? "above similar local listings"}`, source: "market" });
  }
  if (car.personal_use === false) watch.push({ text: "Former rental or fleet vehicle", source: "personal_use" });
  if (car.owner_count !== null && car.owner_count >= 3) watch.push({ text: `${car.owner_count} previous owners`, source: "owner_count" });
  if (car.accident_count === null || car.title_status === null) watch.push({ text: "History not fully reported; ask for a report", source: car.accident_count === null ? "accident_count" : "title_status" });
  if (!car.features_verified) {
    const unconfirmed = checks.length ? null : Object.keys(prefs).find((k) => k.startsWith("feature:") && prefs[k].tier === "must");
    watch.push({ text: unconfirmed ? `${featureLabel(unconfirmed.slice(8))} not confirmed by the listing` : "Feature list not confirmed by the dealer", source: "features_verified" });
  }

  const cost = briefCost(car, prefs, cfg, currentYear);
  return {
    fits: dedupeClaims(fits).slice(0, 3),
    watchOuts: dedupeClaims(watch).slice(0, 3),
    costToOwn: cost,
    costLine: costLine(cost),
    generatedBy: "template",
  };
}

function dedupeClaims(claims: BriefClaim[]): BriefClaim[] {
  const seen = new Set<string>();
  return claims.filter((c) => (seen.has(c.text) ? false : (seen.add(c.text), true)));
}
