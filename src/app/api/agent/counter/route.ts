import { z } from "zod";
import { aiCounterMessage } from "@/lib/ai/counter";
import { msAgo } from "@/lib/format";
import { suggestCounter } from "@/lib/negotiation";
import { ApiError, apiProfile, json, readJson, route } from "@/lib/server/api";
import { loadConfig } from "@/lib/server/data";
import type { DealRating } from "@/lib/types";

const Body = z.object({ offerId: z.string().uuid(), targetOtd: z.number().positive().optional() });

/**
 * Negotiator v2: a suggested counteroffer with sourced reasons, plus a drafted
 * message. The buyer edits both and sends with send_counter(); nothing is sent here.
 */
export const POST = route(async (req: Request) => {
  const { supabase, profile } = await apiProfile();
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new ApiError(400, "Invalid request.");
  const { data: offer } = await supabase.from("offers")
    .select("id, interest_id, status, vehicle_price, doc_fee, dealer_fees, trade_credit, otd_total, seller_user_id, interest:interests(user_id, listing:listings(id, year, make, model, trim_level, expected_price, deal_rating, first_seen_at))")
    .eq("id", parsed.data.offerId).maybeSingle();
  const interest = offer?.interest as unknown as { user_id: string; listing: { id: string; year: number; make: string; model: string; trim_level: string | null; expected_price: number | null; deal_rating: DealRating | null; first_seen_at: string } } | null;
  if (!offer || !interest || interest.user_id !== profile.id) throw new ApiError(404, "Offer not found.");
  if (offer.status !== "active") throw new ApiError(409, "This offer is no longer open.");
  const l = interest.listing;
  const config = await loadConfig(supabase);
  const { data: drops } = await supabase.from("listing_price_changes").select("old_price, new_price").eq("listing_id", l.id).order("changed_at", { ascending: false }).limit(1);
  const drop = drops?.[0] && Number(drops[0].new_price) < Number(drops[0].old_price) ? Number(drops[0].old_price) - Number(drops[0].new_price) : null;
  const tradeCredit = Number(offer.trade_credit);
  const suggestion = suggestCounter({
    vehiclePrice: Number(offer.vehicle_price), docFee: Number(offer.doc_fee), dealerFees: Number(offer.dealer_fees),
    tradeCredit, tradePayoff: 0, otdTotal: Number(offer.otd_total),
  }, {
    expectedPrice: l.expected_price === null ? null : Number(l.expected_price),
    daysOnMarket: Math.max(0, Math.round(msAgo(l.first_seen_at) / 86_400_000)),
    dealRating: l.deal_rating, lastPriceDrop: drop, private: Boolean(offer.seller_user_id),
  }, config);
  const targetOtd = parsed.data.targetOtd ?? suggestion.targetOtd;
  const message = await aiCounterMessage({
    title: `${l.year} ${l.make} ${l.model}${l.trim_level ? ` ${l.trim_level}` : ""}`,
    offerOtd: Number(offer.otd_total), suggestion, targetOtd, firstName: profile.first_name, privateSale: Boolean(offer.seller_user_id),
  }, { store: supabase, userId: profile.id, dailyBudgetUsd: config.ai.daily_budget_usd_per_user });
  return json({ suggestion, targetOtd, message });
});
