// Pass 1 of the deck: turn the buyer's tiers into hard filters for SQL.
// Dealbreakers are always hard. Must-haves are hard only when listing data for
// that criterion is reliable; otherwise they become a heavy ranking boost with
// a "Not confirmed" badge (see ranking.ts).

import { CRITERION_BY_KEY } from "../criteria/catalog";
import { BODY_STYLES, type Pref, type Prefs, type Tier } from "../types";

export interface DeckFilters {
  lat: number;
  lng: number;
  radius_mi: number;
  max_price?: number;
  conditions?: string[];
  year_min?: number;
  year_max?: number;
  body_styles?: string[];
  max_miles?: number;
  fuel_types?: string[];
  drivetrains?: string[];
  transmissions?: string[];
  min_seats?: number;
  require_third_row?: boolean;
  include_makes?: string[];
  exclude_makes?: string[];
  exclude_colors?: string[];
  require_clean_title?: boolean;
  require_no_accidents?: boolean;
  max_owners?: number;
  require_features?: string[];
  seller_types?: string[];
  min_ev_range?: number;
  min_towing?: number;
  exclude_ids?: string[];
}

/** Is this preference applied as a hard filter? */
export function isHard(key: string, pref: Pref | undefined): boolean {
  if (!pref || pref.tier === "dont_care" || pref.tier === "nice") return false;
  if (pref.tier === "dealbreaker") return true;
  // Must-have: hard only when the data is reliable. Features are gated in SQL
  // by listings.features_verified, so they count as hard here.
  if (key.startsWith("feature:")) return true;
  return CRITERION_BY_KEY[key]?.reliable === true;
}

const asArray = (v: unknown): string[] | undefined =>
  Array.isArray(v) && v.length ? v.map(String) : typeof v === "string" && v ? [v] : undefined;
const asNumber = (v: unknown): number | undefined => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : undefined;
};

export interface FilterInput {
  prefs: Prefs;
  origin: { lat: number; lng: number };
  radiusMi: number;
  maxPrice: number | null;
  excludeIds?: string[];
}

export function buildFilters({ prefs, origin, radiusMi, maxPrice, excludeIds }: FilterInput): DeckFilters {
  const f: DeckFilters = { lat: origin.lat, lng: origin.lng, radius_mi: radiusMi };
  if (maxPrice !== null && maxPrice > 0) f.max_price = maxPrice;
  const hard = (key: string) => (isHard(key, prefs[key]) ? prefs[key].value : undefined);

  f.conditions = asArray(hard("condition"));
  const years = hard("year_range") as { min?: number; max?: number } | undefined;
  if (years) {
    f.year_min = asNumber(years.min);
    f.year_max = asNumber(years.max);
  }

  let bodies = asArray(hard("body_styles"));
  const excludedBodies = asArray(hard("body_styles_exclude"));
  if (excludedBodies) {
    bodies = (bodies ?? BODY_STYLES.map((b) => b.key)).filter((b) => !excludedBodies.includes(b));
  }
  f.body_styles = bodies;

  f.max_miles = asNumber(hard("max_mileage"));
  f.fuel_types = asArray(hard("fuel_types"));
  f.drivetrains = asArray(hard("drivetrains"));
  f.transmissions = asArray(hard("transmission"));
  f.min_seats = asNumber(hard("min_seats"));
  if (hard("third_row") === true) f.require_third_row = true;
  f.include_makes = asArray(hard("makes"));
  f.exclude_makes = asArray(hard("brands_exclude"));
  f.exclude_colors = asArray(hard("colors_avoid"));
  if (hard("clean_title") === true) f.require_clean_title = true;
  if (hard("no_accidents") === true) f.require_no_accidents = true;
  f.max_owners = asNumber(hard("max_owners"));
  f.seller_types = asArray(hard("seller_types"));
  f.min_ev_range = asNumber(hard("ev_range"));
  f.min_towing = asNumber(hard("towing_min"));

  const features = Object.entries(prefs)
    .filter(([k, p]) => k.startsWith("feature:") && p.value === true && isHard(k, p))
    .map(([k]) => k.slice("feature:".length));
  if (features.length) f.require_features = features.sort();

  if (excludeIds?.length) f.exclude_ids = excludeIds;

  // Drop undefined keys so the JSON sent to SQL stays small and readable.
  for (const k of Object.keys(f) as (keyof DeckFilters)[]) if (f[k] === undefined) delete f[k];
  return f;
}

/** Tiers that must never be offered for loosening by the empty-deck rescue. */
export function isLockedTier(tier: Tier | undefined): boolean {
  return tier === "dealbreaker";
}
