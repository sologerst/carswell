import { aiBrief } from "@/lib/ai/brief";
import { BRIEF_DISCLAIMER, type CarBrief } from "@/lib/brief/template";
import { profileHash } from "@/lib/profile-hash";
import { ApiError, apiProfile, json, route } from "@/lib/server/api";
import { getCards } from "@/lib/server/deck";

/** AI Car Brief, cached per car + profile hash; regenerated when the price changes. */
export const GET = route(async (_req: Request, ctx: RouteContext<"/api/brief/[listingId]">) => {
  const { listingId } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(listingId)) throw new ApiError(400, "Invalid listing id.");
  const { supabase, profile } = await apiProfile();

  const { ctx: buyer, cards } = await getCards(supabase, profile, [listingId]);
  const card = cards[0];
  if (!card || !buyer) throw new ApiError(404, "Listing not found.");
  const hash = profileHash(buyer.prefs);

  const { data: cached } = await supabase
    .from("car_briefs")
    .select("brief, source, price_at, created_at")
    .eq("user_id", profile.id)
    .eq("listing_id", listingId)
    .eq("profile_hash", hash)
    .maybeSingle();
  if (cached && Number(cached.price_at) === Number(card.listing.price)) {
    return json({ brief: cached.brief as unknown as CarBrief, cached: true, disclaimer: BRIEF_DISCLAIMER });
  }

  const brief = await aiBrief(card.listing, buyer.prefs, buyer.config, {
    store: supabase,
    userId: profile.id,
    dailyBudgetUsd: buyer.config.ai.daily_budget_usd_per_user,
  });
  const { model, ...stored } = brief;
  await supabase.from("car_briefs").upsert({
    user_id: profile.id,
    listing_id: listingId,
    profile_hash: hash,
    price_at: card.listing.price,
    brief: stored as never,
    source: brief.generatedBy,
    model: model ?? null,
  }, { onConflict: "user_id,listing_id,profile_hash" });

  return json({ brief: stored, cached: false, disclaimer: BRIEF_DISCLAIMER });
});
