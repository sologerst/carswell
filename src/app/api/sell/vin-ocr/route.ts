import { z } from "zod";
import { aiJson } from "@/lib/ai/client";
import { ApiError, apiProfile, json, readJson, route } from "@/lib/server/api";
import { loadConfig } from "@/lib/server/data";
import { extractVin } from "@/lib/vin";

const Body = z.object({ image: z.string().max(3_000_000), mime: z.enum(["image/jpeg", "image/png", "image/webp"]) });
const OcrSchema = z.object({ vin: z.string().nullable() });

/**
 * Read a VIN from a photo of the VIN plate or door-jamb sticker (for phones
 * without a barcode scanner). Needs Claude; otherwise the seller types it.
 */
export const POST = route(async (req: Request) => {
  const { supabase, profile } = await apiProfile();
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new ApiError(400, "Send a smaller photo.");
  const config = await loadConfig(supabase);
  const res = await aiJson({
    feature: "vin_ocr",
    tier: "fast",
    maxTokens: 200,
    system: "Read the 17-character vehicle identification number (VIN) in the photo. Return null if you can't read all 17 characters clearly. VINs never contain I, O or Q.",
    schema: OcrSchema,
    usage: { store: supabase, userId: profile.id, dailyBudgetUsd: config.ai.daily_budget_usd_per_user },
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: parsed.data.mime, data: parsed.data.image } },
      { type: "text", text: "What is the VIN?" },
    ] }],
  });
  if (!res) return json({ vin: null, reason: "Photo reading isn't available right now. Type the VIN instead." });
  const vin = res.data.vin ? extractVin(res.data.vin) : null;
  return json({ vin, reason: vin ? null : "We couldn't read a valid VIN. Try a sharper photo or type it." });
});
