import "server-only";

import type { AppConfig } from "../config";
import { buildFilters, type DeckFilters } from "../deck/filters";
import { nextQuestion, type ProfilingQuestion } from "../deck/progressive";
import { buildBatch, cardBadges, matchReasons, scoreCar, type ScoreContext } from "../deck/ranking";
import { applyPatches, looseningOptions, topLoosenings, type Loosening } from "../deck/rescue";
import { budgetFromPrefs, costForCar, maxPriceForBudget } from "../money";
import type { ServerSupabase } from "../supabase/server";
import type { Affinity, DeckCandidate, DeckCard, Prefs } from "../types";
import type { Profile } from "./session";
import { loadAffinities, loadConfig, loadPrefs, zipLocation } from "./data";
import { env } from "../env";

export interface DeckResponse {
  cards: DeckCard[];
  remaining: number;
  rescue: { option: Loosening; gain: number }[];
  question: ProfilingQuestion | null;
  swipeCount: number;
  maxPrice: number | null;
  radiusMi: number;
}

export interface BuyerContext {
  config: AppConfig;
  prefs: Prefs;
  affinities: Affinity[];
  origin: { lat: number; lng: number; zip: string; city: string };
  maxPrice: number | null;
}

export async function buyerContext(supabase: ServerSupabase, profile: Profile): Promise<BuyerContext> {
  const [config, prefs, affinities] = await Promise.all([
    loadConfig(supabase),
    loadPrefs(supabase, profile.id),
    loadAffinities(supabase, profile.id),
  ]);
  const zip = (await zipLocation(supabase, profile.zip)) ?? (await zipLocation(supabase, env.launchMarketZip ?? config.launch_market.zip));
  const origin = zip ? { lat: zip.lat, lng: zip.lng, zip: zip.zip, city: zip.city } : { lat: 36.1503, lng: -86.7916, zip: "37203", city: "Nashville" };
  const budget = budgetFromPrefs(prefs, config.finance);
  const conditions = (prefs.condition?.value as string[] | undefined) ?? [];
  const maxPrice = maxPriceForBudget(budget, config, conditions.length === 1 && conditions[0] === "new" ? "new" : "used");
  return { config, prefs, affinities, origin, maxPrice };
}

export function filtersFor(ctx: BuyerContext, profile: Profile, prefs: Prefs, radiusMi: number, excludeIds: string[] = []): DeckFilters {
  const budget = budgetFromPrefs(prefs, ctx.config.finance);
  const maxPrice = prefs === ctx.prefs ? ctx.maxPrice : maxPriceForBudget(budget, ctx.config);
  return buildFilters({ prefs, origin: ctx.origin, radiusMi, maxPrice, excludeIds });
}

export function toCard(car: DeckCandidate, ctx: BuyerContext, scoreCtx: ScoreContext, scored?: ReturnType<typeof buildBatch>[number]): DeckCard {
  const budget = budgetFromPrefs(ctx.prefs, ctx.config.finance);
  const cost = costForCar(car.price, car.condition, car.dealer_doc_fee, budget, ctx.config);
  return {
    listing: car,
    score: scored?.score ?? 0,
    reasons: scored ? matchReasons(scored, scoreCtx) : [],
    badges: scored ? cardBadges(scored, ctx.prefs) : [],
    otdEstimate: Math.round(cost.otd.total),
    monthlyEstimate: Math.round(cost.monthly),
    afterTrade: Boolean(budget.trade?.has && (budget.trade.value ?? 0) > 0),
    exploration: scored?.exploration ?? false,
  };
}

export async function getDeck(
  supabase: ServerSupabase,
  profile: Profile,
  opts: { exclude?: string[]; anchor?: string | null } = {},
): Promise<DeckResponse> {
  const ctx = await buyerContext(supabase, profile);
  const radiusMi = profile.radius_mi;
  const filters = filtersFor(ctx, profile, ctx.prefs, radiusMi, opts.exclude);

  // One scan returns the candidates and the size of the eligible set.
  const { data, error } = await supabase.rpc("deck_candidates", {
    p_filters: filters as never,
    p_limit: ctx.config.deck.candidates,
    p_explore: ctx.config.deck.explore_candidates,
    p_anchor: opts.anchor ?? undefined,
  });
  if (error) throw error;
  const candidates = (data ?? []) as unknown as DeckCandidate[];

  const affinityMap = new Map(ctx.affinities.map((a) => [a.attribute, a]));
  const scoreCtx: ScoreContext = {
    prefs: ctx.prefs,
    affinities: affinityMap,
    swipes: profile.swipe_count,
    radiusMi,
    maxPrice: ctx.maxPrice,
    config: ctx.config,
  };

  let batch = buildBatch(candidates, scoreCtx);
  if (opts.anchor) {
    // "More like this": visual similarity to the anchor leads.
    batch = [...batch].sort((a, b) => (b.car.visual_sim ?? 0) - (a.car.visual_sim ?? 0));
  }
  const cards = batch.map((s) => toCard(s.car, ctx, scoreCtx, s));

  const total = Number((data?.[0] as { total_eligible?: number } | undefined)?.total_eligible ?? candidates.length);
  const remaining = Math.max(0, total - cards.length);

  let rescue: DeckResponse["rescue"] = [];
  if (remaining < ctx.config.deck.empty_threshold) {
    const options = looseningOptions(ctx.prefs, radiusMi);
    const gains = await Promise.all(options.map(async (option) => {
      const prefs = applyPatches(ctx.prefs, option.prefPatches);
      const f = filtersFor(ctx, profile, prefs, option.radiusMi ?? radiusMi, opts.exclude);
      const { data: c } = await supabase.rpc("deck_count", { p_filters: f as never });
      return { option, gain: Number(c ?? 0) - total };
    }));
    rescue = topLoosenings(gains);
  }

  const question = nextQuestion({
    swipes: profile.swipe_count,
    lastQuestionSwipe: profile.last_question_swipe,
    every: ctx.config.limits.questions_every_swipes,
    affinities: ctx.affinities,
    prefs: ctx.prefs,
    dismissed: profile.dismissed_questions ?? [],
  });

  return { cards, remaining, rescue, question, swipeCount: profile.swipe_count, maxPrice: ctx.maxPrice, radiusMi };
}

export interface ListingCard extends DeckCandidate {
  is_active: boolean;
  description: string | null;
  lat: number;
  lng: number;
}

/** Cards for explicit listing ids (detail view, Likes), with the buyer's cost math. */
export async function getCards(supabase: ServerSupabase, profile: Profile, ids: string[]) {
  if (!ids.length) return { ctx: null, cards: [] as (DeckCard & { listing: ListingCard })[] };
  const ctx = await buyerContext(supabase, profile);
  const { data, error } = await supabase.rpc("listing_cards", { p_ids: ids, p_lat: ctx.origin.lat, p_lng: ctx.origin.lng });
  if (error) throw error;
  const scoreCtx: ScoreContext = {
    prefs: ctx.prefs, affinities: new Map(ctx.affinities.map((a) => [a.attribute, a])), swipes: profile.swipe_count,
    radiusMi: profile.radius_mi, maxPrice: ctx.maxPrice, config: ctx.config,
  };
  const cards = ((data ?? []) as unknown as ListingCard[]).map((car) => {
    const scored = { ...scoreCar(car, scoreCtx), exploration: false };
    return toCard(car, ctx, scoreCtx, scored) as DeckCard & { listing: ListingCard };
  });
  return { ctx, cards };
}
