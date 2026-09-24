import { z } from "zod";
import { extractFromChip, mergeExtractions, type Extraction } from "@/lib/onboarding/extract";
import { ApiError, apiProfile, json, readJson, route } from "@/lib/server/api";
import { loadPrefs, upsertPrefs, zipLocation } from "@/lib/server/data";
import { finishOnboarding, STATE_KEY } from "@/lib/server/onboarding";
import type { Pref } from "@/lib/types";

const Body = z.object({
  budget: z.string().regex(/^(monthly|cash):\d+$/),
  zip: z.string().regex(/^\d{5}$/),
  radius: z.number().int().min(5).max(500),
  condition: z.string().max(40),
  body: z.array(z.string().max(30)).min(1).max(10),
  seats: z.string().regex(/^\d$/),
  fuel: z.array(z.string().max(20)).max(6),
  history: z.enum(["title", "accidents", "both", "none"]),
  trade: z.enum(["yes", "no"]),
  timeline: z.enum(["week", "month", "quarter", "browsing"]),
  taste: z.object({ chosen: z.array(z.string().uuid()).max(10), rejected: z.array(z.string().uuid()).max(10) }).optional(),
});

/** Form-based onboarding (the no-AI fallback): the same 10 questions as screens. */
export const POST = route(async (req: Request) => {
  const { supabase, profile } = await apiProfile();
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new ApiError(400, "Please answer every question.");
  const f = parsed.data;
  if (!(await zipLocation(supabase, f.zip))) throw new ApiError(400, "CarSwipe is live around Nashville; try a Middle Tennessee ZIP.");

  const parts: Extraction[] = [
    extractFromChip("budget", f.budget),
    extractFromChip("condition", f.condition),
    extractFromChip("body", f.body.join(",")),
    extractFromChip("seats", f.seats),
    extractFromChip("fuel", f.fuel.length ? f.fuel.join(",") : "any"),
    extractFromChip("history", f.history),
    extractFromChip("trade", f.trade),
    extractFromChip("timeline", f.timeline),
  ];
  const x = parts.reduce(mergeExtractions);
  const changes: Record<string, Pref> = Object.fromEntries(Object.entries(x.prefs).map(([k, p]) => [k, p as Pref]));
  if (f.taste && (f.taste.chosen.length || f.taste.rejected.length)) {
    await supabase.rpc("seed_taste", { p_chosen: f.taste.chosen, p_rejected: f.taste.rejected });
  }
  changes[STATE_KEY] = { value: { answered: ["budget", "location", "condition", "body", "seats", "fuel", "history", "trade", "timeline"], taste_done: true, facts: [] }, tier: "dont_care", source: "default" };
  await upsertPrefs(supabase, profile.id, changes);
  const { data: updated } = await supabase.from("profiles").update({ zip: f.zip, radius_mi: f.radius, onboarding_method: "form" }).eq("id", profile.id).select("*").single();
  const prefs = await loadPrefs(supabase, profile.id);
  const summary = await finishOnboarding(supabase, updated ?? profile, prefs, "form");
  return json({ ok: true, summary });
});
