import "server-only";

import type { AppConfig } from "../config";
import { budgetFromPrefs, maxPriceForBudget } from "../money";
import type { AdminSupabase } from "../supabase/admin";
import type { Prefs, PrefSource, Tier } from "../types";
import { loadConfigAdmin } from "./admin-data";

const BUDGET_KEYS = ["budget_mode", "max_cash_price", "max_monthly_payment", "down_payment", "loan_term", "credit_tier", "trade_in"];

/**
 * Keep profiles.budget_max_price in step with each buyer's budget (the same
 * Tennessee out-the-door math the deck uses). Only aggregated, k-anonymous
 * reports ever read it.
 */
export async function refreshBudgets(admin: AdminSupabase, config: AppConfig) {
  let updated = 0;
  for (let from = 0; ; from += 500) {
    const { data: people } = await admin.from("profiles").select("id, budget_max_price")
      .not("onboarding_completed_at", "is", null).is("paused_at", null).order("id").range(from, from + 499);
    if (!people?.length) break;
    for (let i = 0; i < people.length; i += 150) {
      const chunk = people.slice(i, i + 150);
      const { data: rows } = await admin.from("buyer_preferences").select("user_id, key, value, tier, source")
        .in("user_id", chunk.map((p) => p.id)).in("key", BUDGET_KEYS);
      const prefsBy = new Map<string, Prefs>();
      for (const r of rows ?? []) {
        const p = prefsBy.get(r.user_id) ?? {};
        p[r.key] = { value: r.value, tier: r.tier as Tier, source: r.source as PrefSource };
        prefsBy.set(r.user_id, p);
      }
      for (const person of chunk) {
        const max = maxPriceForBudget(budgetFromPrefs(prefsBy.get(person.id) ?? {}, config.finance), config);
        const rounded = max === null ? null : Math.round(max);
        if (rounded !== (person.budget_max_price === null ? null : Math.round(Number(person.budget_max_price)))) {
          await admin.from("profiles").update({ budget_max_price: rounded }).eq("id", person.id);
          updated++;
        }
      }
    }
    if (people.length < 500) break;
  }
  return updated;
}

/** Nightly demand-intelligence rollups (Phase 2). */
export async function runInsights(admin: AdminSupabase) {
  const config = await loadConfigAdmin(admin);
  const budgets = await refreshBudgets(admin, config);
  const { data, error } = await admin.rpc("refresh_demand_insights", { p_k: config.insights.k_anonymity });
  if (error) throw error;
  return { budgets, rows: data };
}

// Display helpers shared by the dealer and admin views ------------------------

export interface ListingPassInsight {
  listing_id: string;
  title: string;
  price: number;
  passes: number;
  likes: number;
  buyers: number;
  like_rate: number | null;
  peer_like_rate: number | null;
  tolerance_price: number | null;
  tolerance_buyers: number | null;
}

export interface UnmetDemandInsight { body_style: string; max_price: number; buyers: number; radius_mi?: number; supply?: number }

const compactUsd = (n: number) => (n >= 1000 ? `$${Math.round(n / 1000)}K` : `$${n}`);

export function unmetLabel(bodyLabel: string, maxPrice: number) {
  return `${bodyLabel} under ${compactUsd(maxPrice)}`;
}

/** "This 2021 Tahoe was passed 212 times this month. Buyers who liked similar Tahoes tolerated prices about $1,800 lower." */
export function passSentence(i: ListingPassInsight): string {
  const parts = [`Passed ${i.passes} time${i.passes === 1 ? "" : "s"} in the last 30 days (${i.likes} like${i.likes === 1 ? "" : "s"}).`];
  if (i.like_rate !== null && i.peer_like_rate !== null) {
    const diff = Math.round((i.like_rate - i.peer_like_rate) * 100);
    if (Math.abs(diff) >= 3) parts.push(`Like rate is ${Math.abs(diff)} points ${diff < 0 ? "below" : "above"} the same model elsewhere.`);
  }
  if (i.tolerance_price !== null) {
    const gap = Math.round((i.price - i.tolerance_price) / 100) * 100;
    if (gap >= 300) parts.push(`Buyers who liked similar cars went for sticker prices about $${gap.toLocaleString("en-US")} lower.`);
    else if (gap <= -300) parts.push(`Priced about $${Math.abs(gap).toLocaleString("en-US")} below what buyers of similar cars liked.`);
  }
  return parts.join(" ");
}
