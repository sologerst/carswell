// Price suggestions for private sellers from the market model (the same
// price-vs-miles regression that drives deal ratings).

export interface PriceSuggestion {
  /** Priced to sell within about two weeks. */
  quick: number;
  /** A fair asking range. */
  low: number;
  high: number;
  expected: number;
}

const round50 = (n: number) => Math.round(n / 50) * 50;

export function suggestPrivatePrice(expected: number | null | undefined): PriceSuggestion | null {
  if (!expected || expected <= 0) return null;
  // Private sales usually land a little under dealer asking prices.
  return {
    expected: round50(expected),
    quick: round50(expected * 0.9),
    low: round50(expected * 0.93),
    high: round50(expected * 1.0),
  };
}

/** Estimated trade-in range from the market model, by condition. */
export function tradeInRange(expected: number | null | undefined, condition: "excellent" | "good" | "fair" | "rough"): { low: number; high: number } | null {
  if (!expected || expected <= 0) return null;
  // Dealers buy at wholesale: roughly 75-88% of retail asking, less for rough cars.
  const band = { excellent: [0.82, 0.88], good: [0.77, 0.84], fair: [0.68, 0.76], rough: [0.55, 0.65] }[condition];
  return { low: round50(expected * band[0]), high: round50(expected * band[1]) };
}
