import { z } from "zod";
import { aiDraft, type DraftContext } from "@/lib/ai/negotiator";
import { usd } from "@/lib/format";
import { ApiError, apiProfile, json, readJson, route } from "@/lib/server/api";
import { loadConfig, loadPrefs } from "@/lib/server/data";
import type { TradeIn } from "@/lib/types";

const Body = z.object({
  interestId: z.string().uuid(),
  intent: z.enum(["request_otd", "negotiate", "test_drive", "trade_in", "question"]),
  note: z.string().max(500).optional(),
});

/** Negotiator draft. Saved to message_drafts for the buyer to approve, edit or discard. */
export const POST = route(async (req: Request) => {
  const { supabase, profile } = await apiProfile();
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new ApiError(400, "Invalid draft request.");
  const { interestId, intent, note } = parsed.data;

  const { data: interest } = await supabase
    .from("interests")
    .select("id, user_id, test_drive_windows, listing:listings(year, make, model, trim_level, price, expected_price, vin, first_seen_at), dealership:dealerships(name)")
    .eq("id", interestId)
    .maybeSingle();
  if (!interest || interest.user_id !== profile.id) throw new ApiError(404, "Car not found.");
  const listing = interest.listing as unknown as { year: number; make: string; model: string; trim_level: string | null; price: number; expected_price: number | null; vin: string; first_seen_at: string };

  const [{ data: offers }, { data: conversation }, prefs, config] = await Promise.all([
    supabase.from("offers").select("otd_total, vehicle_price, doc_fee, dealer_fees").eq("interest_id", interestId).in("status", ["active", "picked"]),
    supabase.from("conversations").select("id").eq("interest_id", interestId).maybeSingle(),
    loadPrefs(supabase, profile.id),
    loadConfig(supabase),
  ]);
  const { data: history } = conversation
    ? await supabase.from("messages").select("sender_role, body").eq("conversation_id", conversation.id).order("created_at", { ascending: false }).limit(8)
    : { data: [] };

  const budgetText = prefs.budget_mode?.value === "cash"
    ? prefs.max_cash_price ? `cash up to ${usd(Number(prefs.max_cash_price.value))}` : null
    : prefs.max_monthly_payment ? `about $${prefs.max_monthly_payment.value}/mo` : null;
  const ctx: DraftContext = {
    intent,
    note,
    buyerFirstName: profile.first_name,
    car: {
      year: listing.year, make: listing.make, model: listing.model, trim: listing.trim_level, price: Number(listing.price),
      expected: listing.expected_price ? Number(listing.expected_price) : null, vin: listing.vin,
      daysOnMarket: Math.max(0, Math.round((Date.now() - new Date(listing.first_seen_at).getTime()) / 86_400_000)),
    },
    dealerName: (interest.dealership as unknown as { name: string } | null)?.name ?? null,
    offers: (offers ?? []).map((o) => ({ otd: Number(o.otd_total), vehiclePrice: Number(o.vehicle_price), fees: Number(o.doc_fee) + Number(o.dealer_fees) })),
    budgetText,
    trade: (prefs.trade_in?.value as TradeIn | undefined)?.has ? (prefs.trade_in.value as TradeIn) : null,
    testDriveWindows: interest.test_drive_windows as { day: string; time: string }[] | null,
    history: (history ?? []).reverse().map((m) => ({ role: m.sender_role as "buyer" | "dealer" | "system", body: m.body })),
  };

  const draft = await aiDraft(ctx, { store: supabase, userId: profile.id, dailyBudgetUsd: config.ai.daily_budget_usd_per_user });
  const { data: saved, error } = await supabase.from("message_drafts").insert({
    conversation_id: conversation?.id ?? null,
    interest_id: interestId,
    user_id: profile.id,
    body: draft.body,
    intent,
    source: draft.source,
  }).select("id, body, intent, source, created_at").single();
  if (error) throw new ApiError(400, error.message);
  return json({ draft: saved });
});
