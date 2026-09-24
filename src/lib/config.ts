// Typed defaults for the app_config table. The database copy wins; these
// defaults keep the app working if a key is missing and seed the table.

export interface RampWeight {
  /** Weight at swipe 0. */
  w0: number;
  /** Weight at swipe 50+. */
  w50: number;
}

export type RankingComponent =
  | "stated"
  | "affinity"
  | "visual"
  | "deal"
  | "distance"
  | "freshness"
  | "quality"
  | "headroom"
  | "matchability";

export interface AppConfig {
  ranking_weights: { ramp_swipes: number; components: Record<RankingComponent, RampWeight> };
  exploration: { batch_size: number; rate_start: number; rate_after: number; after_swipes: number };
  limits: {
    likes_per_day: number;
    superlikes_per_day: number;
    messages_per_minute: number;
    dealer_reply_hours: number;
    offplatform_reply_days: number;
    private_reply_hours: number;
    questions_every_swipes: number;
  };
  learning: { affinity_cap: number; pass_weight: number; superlike_weight: number; taste_pass_share: number };
  tax_tn: {
    state_rate: number;
    local_rate: number;
    local_cap: number;
    single_article_rate: number;
    single_article_min: number;
    single_article_max: number;
    title_registration: number;
    doc_fee_taxable: boolean;
  };
  finance: {
    default_term_months: number;
    default_credit_tier: CreditTier;
    default_doc_fee: number;
    apr: { new: Record<CreditTier, number>; used: Record<CreditTier, number> };
  };
  cost_to_own: {
    miles_per_month: number;
    gas_price_per_gallon: number;
    electricity_per_kwh: number;
    ev_miles_per_kwh: number;
    insurance_base_monthly: number;
    insurance_per_10k_value: number;
    maintenance_base_monthly: number;
    maintenance_per_year_of_age: number;
  };
  ai: { daily_budget_usd_per_user: number };
  deck: { empty_threshold: number; candidates: number; explore_candidates: number };
  purchase_prompts: { days_after_match: number[] };
  launch_market: { id: string; zip: string };
}

export type CreditTier = "excellent" | "good" | "fair" | "rebuilding";

export const DEFAULT_CONFIG: AppConfig = {
  ranking_weights: {
    ramp_swipes: 50,
    components: {
      stated: { w0: 0.4, w50: 0.2 },
      affinity: { w0: 0.05, w50: 0.15 },
      visual: { w0: 0.05, w50: 0.15 },
      deal: { w0: 0.15, w50: 0.15 },
      distance: { w0: 0.1, w50: 0.1 },
      freshness: { w0: 0.08, w50: 0.08 },
      quality: { w0: 0.07, w50: 0.07 },
      headroom: { w0: 0.05, w50: 0.05 },
      matchability: { w0: 0.05, w50: 0.05 },
    },
  },
  exploration: { batch_size: 20, rate_start: 0.15, rate_after: 0.08, after_swipes: 300 },
  limits: {
    likes_per_day: 150,
    superlikes_per_day: 3,
    messages_per_minute: 20,
    dealer_reply_hours: 48,
    offplatform_reply_days: 14,
    private_reply_hours: 72,
    questions_every_swipes: 20,
  },
  learning: { affinity_cap: 30, pass_weight: 0.5, superlike_weight: 2, taste_pass_share: 0.3 },
  // [VERIFY TN rates] Tennessee: 7% state sales tax on the full taxable price,
  // local option tax on the first $1,600, and the state single-article tax on
  // $1,600.01-$3,200. Trade-in value reduces the taxable price.
  tax_tn: {
    state_rate: 0.07,
    local_rate: 0.0225,
    local_cap: 1600,
    single_article_rate: 0.0275,
    single_article_min: 1600,
    single_article_max: 3200,
    title_registration: 120,
    doc_fee_taxable: true,
  },
  // [SET] Estimated APRs by credit tier; shown as assumptions, never as offers.
  finance: {
    default_term_months: 72,
    default_credit_tier: "good",
    default_doc_fee: 699,
    apr: {
      new: { excellent: 5.9, good: 7.4, fair: 10.9, rebuilding: 15.9 },
      used: { excellent: 7.4, good: 9.9, fair: 14.4, rebuilding: 19.9 },
    },
  },
  cost_to_own: {
    miles_per_month: 1100,
    gas_price_per_gallon: 3.05,
    electricity_per_kwh: 0.13,
    ev_miles_per_kwh: 3.4,
    insurance_base_monthly: 95,
    insurance_per_10k_value: 14,
    maintenance_base_monthly: 45,
    maintenance_per_year_of_age: 6,
  },
  ai: { daily_budget_usd_per_user: 0.25 },
  deck: { empty_threshold: 6, candidates: 300, explore_candidates: 100 },
  purchase_prompts: { days_after_match: [14, 30] },
  launch_market: { id: "nashville", zip: "37203" },
};

export const CONFIG_DESCRIPTIONS: Record<keyof AppConfig, string> = {
  ranking_weights: "Soft-score weights; each slides from w0 at swipe 0 to w50 at swipe 50+.",
  exploration: "Share of each batch that tests uncertain tastes.",
  limits: "Daily like/super-like caps, message rate, dealer reply windows, question pacing.",
  learning: "How swipes update taste: tally cap, pass and super-like weights.",
  tax_tn: "Tennessee tax and fee estimates for out-the-door math. [VERIFY TN rates]",
  finance: "Payment estimator assumptions: APR by credit tier, default term and doc fee.",
  cost_to_own: "Monthly cost-to-own estimate inputs.",
  ai: "Per-user daily AI budget; beyond it the app falls back to templates.",
  deck: "Deck sizes and the empty-deck rescue threshold.",
  purchase_prompts: "Days after a match to ask \"Did you buy it?\".",
  launch_market: "Launch market and its center ZIP.",
};

/** Merge database rows over the defaults, key by key (shallow per key). */
export function mergeConfig(rows: { key: string; value: unknown }[] | null | undefined): AppConfig {
  const merged: AppConfig = structuredClone(DEFAULT_CONFIG);
  for (const row of rows ?? []) {
    if (row.key in merged && row.value && typeof row.value === "object") {
      const k = row.key as keyof AppConfig;
      (merged as unknown as Record<string, unknown>)[k] = {
        ...(merged[k] as object),
        ...(row.value as object),
      };
    }
  }
  return merged;
}
