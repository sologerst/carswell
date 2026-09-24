// Normalize raw source rows onto CarSwipe's canonical fields.

import { extractFeaturesFromText } from "../criteria/features";
import type { BodyStyle, Drivetrain, FuelType } from "../types";

export function normalizeBody(raw: string | null | undefined, seats?: number | null): BodyStyle | null {
  const s = (raw ?? "").toLowerCase();
  if (!s) return null;
  if (/pickup|truck|crew cab|extended cab/.test(s)) return "pickup";
  if (/minivan|van/.test(s)) return "minivan";
  if (/wagon/.test(s)) return "wagon";
  if (/convertible|cabriolet|roadster/.test(s)) return "convertible";
  if (/coupe/.test(s)) return "coupe";
  if (/hatch/.test(s)) return "hatchback";
  if (/sedan/.test(s)) return "sedan";
  if (/suv|sport utility|crossover|cuv/.test(s)) {
    if ((seats ?? 0) >= 7 || /3[- ]row|third/.test(s)) return "three_row_suv";
    if (/compact|small|subcompact/.test(s)) return "compact_suv";
    return "midsize_suv";
  }
  return null;
}

export function normalizeFuel(raw: string | null | undefined): FuelType {
  const s = (raw ?? "").toLowerCase();
  if (/plug|phev/.test(s)) return "plugin_hybrid";
  if (/hybrid/.test(s)) return "hybrid";
  if (/electric|\bev\b|battery/.test(s)) return "electric";
  if (/diesel/.test(s)) return "diesel";
  return "gas";
}

export function normalizeDrive(raw: string | null | undefined): Drivetrain | null {
  const s = (raw ?? "").toLowerCase();
  if (/4wd|4x4|four/.test(s)) return "4wd";
  if (/awd|all/.test(s)) return "awd";
  if (/rwd|rear/.test(s)) return "rwd";
  if (/fwd|front/.test(s)) return "fwd";
  return null;
}

const COLOR_FAMILIES: [RegExp, string][] = [
  [/white|pearl|ivory|snow|glacier|frost/i, "white"],
  [/black|ebony|onyx|obsidian|midnight|jet/i, "black"],
  [/silver|platinum|steel|aluminum/i, "silver"],
  [/gr[ae]y|graphite|charcoal|gunmetal|magnetic|granite|slate|lunar/i, "gray"],
  [/blue|navy|azure|cobalt|sapphire|ocean|blueprint/i, "blue"],
  [/red|ruby|crimson|burgundy|maroon|cherry|garnet/i, "red"],
  [/green|olive|army|cypress|sage|forest|emerald/i, "green"],
  [/brown|beige|tan|bronze|sand|kalahari|mocha|champagne|gold/i, "brown"],
  [/orange|copper|sunset/i, "orange"],
];

export function colorFamily(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return COLOR_FAMILIES.find(([re]) => re.test(raw))?.[1] ?? null;
}

/** Regex feature matcher: the non-AI enrichment fallback. */
export function featuresFromListingText(description: string | null | undefined, options: string[] = []): string[] {
  return extractFeaturesFromText([description ?? "", ...options].join(". "));
}
