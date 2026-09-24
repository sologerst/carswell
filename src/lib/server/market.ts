import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";

type Db = SupabaseClient<Database>;

export interface MarketEstimate {
  expected: number | null;
  comps: number;
  basis: "trim" | "model" | "median" | null;
}

/**
 * Expected asking price for a car from market_price_stats (nightly
 * price-vs-miles regression), falling back to the median of close comps.
 */
export async function marketEstimate(db: Db, car: {
  year: number; make: string; model: string; trim?: string | null; miles: number;
}): Promise<MarketEstimate> {
  const { data: stats } = await db.from("market_price_stats")
    .select("trim_level, n, slope_per_mile, intercept")
    .eq("year", car.year).ilike("make", car.make).ilike("model", car.model)
    .in("trim_level", [car.trim ?? "", "*"]);
  const pick = (stats ?? []).sort((a, b) => (a.trim_level === "*" ? 1 : 0) - (b.trim_level === "*" ? 1 : 0))
    .find((s) => s.slope_per_mile !== null && s.intercept !== null && s.slope_per_mile < 0);
  if (pick) {
    const expected = Math.round(Number(pick.intercept) + Number(pick.slope_per_mile) * car.miles);
    if (expected > 500) return { expected, comps: pick.n, basis: pick.trim_level === "*" ? "model" : "trim" };
  }

  const { data: comps } = await db.from("listings")
    .select("price, miles")
    .eq("is_active", true).eq("is_canonical", true)
    .ilike("make", car.make).ilike("model", car.model)
    .gte("year", car.year - 1).lte("year", car.year + 1)
    .gte("miles", Math.max(0, car.miles - 30000)).lte("miles", car.miles + 30000)
    .limit(50);
  if (!comps || comps.length < 3) return { expected: null, comps: comps?.length ?? 0, basis: null };
  const prices = comps.map((c) => Number(c.price)).sort((a, b) => a - b);
  const mid = Math.floor(prices.length / 2);
  const median = prices.length % 2 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
  return { expected: Math.round(median), comps: prices.length, basis: "median" };
}
