import { z } from "zod";
import { templateProfileSummary } from "@/lib/ai/summaries";
import { LIFE_STORY_KEY } from "@/lib/criteria/catalog";
import { profileHash } from "@/lib/profile-hash";
import { ApiError, apiProfile, json, readJson, route } from "@/lib/server/api";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import { loadPrefs, upsertPrefs, zipLocation } from "@/lib/server/data";
import type { Pref } from "@/lib/types";

const PrefSchema = z.object({
  // Preference values are small (numbers, lists of options, a trade-in object).
  value: z.unknown().refine((v) => JSON.stringify(v ?? null).length <= 4000, "Preference value is too large."),
  tier: z.enum(["dealbreaker", "must", "nice", "dont_care"]),
  source: z.enum(["said", "swiped", "life", "default"]).default("said"),
});

const Body = z.object({
  set: z.record(z.string().max(80), PrefSchema).refine((r) => Object.keys(r).length <= 60, "Too many preferences at once.").optional(),
  delete: z.array(z.string().max(80)).max(50).optional(),
  profile: z.object({
    first_name: z.string().max(40).nullable().optional(),
    phone: z.string().max(30).nullable().optional(),
    zip: z.string().regex(/^\d{5}$/).optional(),
    radius_mi: z.number().int().min(5).max(500).optional(),
    paused: z.boolean().optional(),
  }).optional(),
});

/** Edit preferences (profile chips, tiers, empty-deck rescue) and profile fields. */
export const PATCH = route(async (req: Request) => {
  const { supabase, profile } = await apiProfile();
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new ApiError(400, "Invalid preferences.");
  const { set = {}, delete: del = [], profile: p } = parsed.data;

  const changes: Record<string, Pref | null> = {};
  for (const [k, v] of Object.entries(set)) {
    if (k.startsWith("_")) continue;
    changes[k] = { value: v.value, tier: v.tier, source: v.source };
  }
  for (const k of del) if (!k.startsWith("_")) changes[k] = null;
  await upsertPrefs(supabase, profile.id, changes);

  const patch: TablesUpdate<"profiles"> = {};
  if (p) {
    if (p.first_name !== undefined) patch.first_name = p.first_name;
    if (p.phone !== undefined) patch.phone = p.phone;
    if (p.radius_mi !== undefined) patch.radius_mi = p.radius_mi;
    if (p.paused !== undefined) patch.paused_at = p.paused ? new Date().toISOString() : null;
    if (p.zip !== undefined) {
      if (!(await zipLocation(supabase, p.zip))) throw new ApiError(400, "That ZIP isn't in our launch market yet.");
      patch.zip = p.zip;
    }
  }
  const prefs = await loadPrefs(supabase, profile.id);
  const visible = Object.fromEntries(Object.entries(prefs).filter(([k]) => !k.startsWith("_") && k !== LIFE_STORY_KEY));
  patch.profile_hash = profileHash(visible);
  if (Object.keys(changes).length) patch.ai_summary = templateProfileSummary(visible);
  const { data, error } = await supabase.from("profiles").update(patch).eq("id", profile.id).select("*").single();
  if (error) throw new ApiError(400, error.message);
  return json({ ok: true, profile: data, prefs });
});
