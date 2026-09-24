// Deal bands from a local price-vs-miles regression: Great (10%+ below
// expected), Good (3-10%), Fair (within 3%), High (3-10% above), Overpriced.

import type { DealRating } from "./types";

export function dealBand(price: number, expected: number | null | undefined): DealRating | null {
  if (!expected || expected <= 0 || !price) return null;
  const ratio = price / expected;
  if (ratio <= 0.9) return "great";
  if (ratio <= 0.97) return "good";
  if (ratio <= 1.03) return "fair";
  if (ratio <= 1.1) return "high";
  return "overpriced";
}

export const DEAL_LABEL: Record<DealRating, string> = {
  great: "Great deal",
  good: "Good deal",
  fair: "Fair price",
  high: "High price",
  overpriced: "Overpriced",
};

/** Tone for badge colors: green, amber, red only for deal badges. */
export const DEAL_TONE: Record<DealRating, "good" | "neutral" | "bad"> = {
  great: "good",
  good: "good",
  fair: "neutral",
  high: "bad",
  overpriced: "bad",
};

/** "$1,900 below market" / "$800 above market" / null when within $100. */
export function marketDeltaText(price: number, expected: number | null | undefined): string | null {
  if (!expected) return null;
  const delta = Math.round((expected - price) / 100) * 100;
  if (Math.abs(delta) < 100) return null;
  return `$${Math.abs(delta).toLocaleString("en-US")} ${delta > 0 ? "below" : "above"} market`;
}
