import sharp from "sharp";
import { z } from "zod";
import { aiTradeNotes } from "@/lib/ai/trade";
import { tradeInRange } from "@/lib/pricing";
import { ApiError, apiProfile, json, readJson, route } from "@/lib/server/api";
import { loadConfig } from "@/lib/server/data";
import { marketEstimate } from "@/lib/server/market";
import { createAdminClient } from "@/lib/supabase/admin";

const Body = z.object({
  vin: z.string().regex(/^[A-HJ-NPR-Z0-9]{17}$/i).nullish(),
  year: z.number().int().min(1981).max(2100),
  make: z.string().trim().min(1).max(40),
  model: z.string().trim().min(1).max(60),
  trim: z.string().trim().max(60).nullish(),
  miles: z.number().int().min(0).max(999_999),
  condition: z.enum(["excellent", "good", "fair", "rough"]),
  photoPaths: z.array(z.string().max(300)).max(8).default([]),
});

/**
 * Trade-in estimate from the market model (wholesale band by condition),
 * with optional AI notes on uploaded photos. An estimate, not an offer.
 */
export const POST = route(async (req: Request) => {
  const { supabase, profile } = await apiProfile();
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new ApiError(400, "Check the year, make, model and miles.");
  const b = parsed.data;
  if (b.photoPaths.some((p) => !p.startsWith(`${profile.id}/`) || p.includes(".."))) throw new ApiError(400, "Invalid photo.");
  const admin = createAdminClient();
  const config = await loadConfig(supabase);
  const estimate = await marketEstimate(admin, { year: b.year, make: b.make, model: b.model, trim: b.trim, miles: b.miles });

  const images: string[] = [];
  for (const path of b.photoPaths.slice(0, 4)) {
    const { data: blob } = await admin.storage.from("trade-photos").download(path);
    if (blob) images.push((await sharp(Buffer.from(await blob.arrayBuffer())).rotate().resize(1024, 1024, { fit: "inside" }).jpeg({ quality: 80 }).toBuffer()).toString("base64"));
  }
  const title = `${b.year} ${b.make} ${b.model}${b.trim ? ` ${b.trim}` : ""}`;
  const ai = await aiTradeNotes(title, images, { store: admin, userId: profile.id, dailyBudgetUsd: config.ai.daily_budget_usd_per_user });
  // Use the more conservative of the stated and photo-based condition.
  const order = ["excellent", "good", "fair", "rough"] as const;
  const condition = ai && order.indexOf(ai.condition) > order.indexOf(b.condition) ? ai.condition : b.condition;
  const range = tradeInRange(estimate.expected, condition);
  if (!range) return json({ range: null, reason: "Not enough similar cars nearby to estimate this one. A dealer appraisal is your best bet." });

  const { data: row } = await admin.from("trade_estimates").insert({
    user_id: profile.id, vin: b.vin?.toUpperCase() ?? null, year: b.year, make: b.make, model: b.model, trim_level: b.trim ?? null,
    miles: b.miles, condition, low: range.low, high: range.high, photo_paths: b.photoPaths,
    notes: { ai: ai?.notes ?? [], stated_condition: b.condition, comps: estimate.comps } as never, source: ai ? "ai" : "model",
  }).select("id").single();
  return json({ id: row?.id, range, condition, retail: estimate.expected, comps: estimate.comps, notes: ai?.notes ?? [], adjusted: condition !== b.condition });
});
