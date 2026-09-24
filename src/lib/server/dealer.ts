import "server-only";

import type { AppConfig } from "../config";
import { budgetFromPrefs, maxPriceForBudget } from "../money";
import type { ServerSupabase } from "../supabase/server";
import type { Prefs, TradeIn } from "../types";

export interface Lead {
  interest_id: string;
  status: string;
  kind: string;
  created_at: string;
  sla_expires_at: string | null;
  matched_at: string | null;
  test_drive_windows: { day: string; time: string }[] | null;
  dossier: { first_name?: string; zip?: string; preferences?: Record<string, unknown>; top_tastes?: string[]; ai_summary?: string };
  lead_summary: string | null;
  buyer_notes: { body: string; at: string }[];
  listing_id: string;
  listing_title: string;
  listing_price: number;
  listing_vin: string;
  listing_photo: string | null;
  listing_miles: number;
  distance_mi: number | null;
  offer_count: number;
  best_offer_otd: number | null;
  buyer_email: string | null;
  buyer_phone: string | null;
  conversation_id: string | null;
  budgetFit: "fits" | "stretch" | "over" | "unknown";
  maxPrice: number | null;
}

export async function loadLeads(supabase: ServerSupabase, dealershipId: string, config: AppConfig): Promise<Lead[]> {
  const { data, error } = await supabase.rpc("dealer_leads", { p_dealership_id: dealershipId });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const dossier = (row.dossier ?? {}) as Lead["dossier"];
    const prefs: Prefs = Object.fromEntries(Object.entries(dossier.preferences ?? {}).map(([k, v]) => [k, { value: v, tier: "must", source: "said" }]));
    const maxPrice = maxPriceForBudget(budgetFromPrefs(prefs, config.finance), config);
    const price = Number(row.listing_price);
    const budgetFit = maxPrice === null ? "unknown" : price <= maxPrice ? "fits" : price <= maxPrice * 1.08 ? "stretch" : "over";
    return {
      ...row,
      listing_price: price,
      best_offer_otd: row.best_offer_otd === null ? null : Number(row.best_offer_otd),
      test_drive_windows: row.test_drive_windows as Lead["test_drive_windows"],
      buyer_notes: (row.buyer_notes as Lead["buyer_notes"]) ?? [],
      dossier,
      budgetFit,
      maxPrice,
    } as Lead;
  });
}

export function describeFinancing(p: Record<string, unknown> | undefined): string {
  if (!p) return "Not shared";
  if (p.financing_status === "cash" || p.budget_mode === "cash") return "Cash buyer";
  if (p.financing_status === "preapproved") return "Pre-approved";
  const credit = p.credit_tier ? `${String(p.credit_tier)} credit` : "credit not shared";
  return `Needs financing · ${credit}`;
}

export function describeBudget(p: Record<string, unknown> | undefined): string {
  if (!p) return "Not shared";
  if (p.budget_mode === "cash") return p.max_cash_price ? `Up to $${Number(p.max_cash_price).toLocaleString("en-US")} cash` : "Cash";
  return p.max_monthly_payment ? `$${p.max_monthly_payment}/mo${p.down_payment ? `, $${Number(p.down_payment).toLocaleString("en-US")} down` : ""}` : "Not shared";
}

export function describeTrade(p: Record<string, unknown> | undefined): string {
  const t = p?.trade_in as TradeIn | undefined;
  if (!t) return "Not shared";
  if (!t.has) return "No trade";
  return [t.description ?? "Yes", t.value ? `~$${t.value.toLocaleString("en-US")}` : null, t.payoff ? `owes ~$${t.payoff.toLocaleString("en-US")}` : null].filter(Boolean).join(" · ");
}

export const TIMELINE_TEXT: Record<string, string> = { week: "This week", month: "This month", quarter: "1-3 months", browsing: "Browsing" };
