import { z } from "zod";
import { aiExtractOnboarding } from "@/lib/ai/onboarding";
import { aiProfileSummary } from "@/lib/ai/summaries";
import { LIFE_STORY_KEY } from "@/lib/criteria/catalog";
import { extractFromText } from "@/lib/onboarding/extract";
import { profileHash } from "@/lib/profile-hash";
import { ApiError, apiProfile, json, readJson, route } from "@/lib/server/api";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import { loadConfig, loadPrefs, upsertPrefs, zipLocation } from "@/lib/server/data";
import type { Pref } from "@/lib/types";

const Body = z.object({ message: z.string().min(1).max(2000) });

/** "Refine by chat": tell the AI what changed; it updates the matching chips. */
export const POST = route(async (req: Request) => {
  const { supabase, profile } = await apiProfile();
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new ApiError(400, "Say what you'd like to change.");
  const config = await loadConfig(supabase);
  const usage = { store: supabase, userId: profile.id, dailyBudgetUsd: config.ai.daily_budget_usd_per_user };

  const ai = await aiExtractOnboarding(parsed.data.message, { alreadyKnown: "", source: "said" }, usage);
  const x = ai?.extraction ?? extractFromText(parsed.data.message, "said");
  const changes: Record<string, Pref> = {};
  for (const [k, p] of Object.entries(x.prefs)) changes[k] = p as Pref;
  await upsertPrefs(supabase, profile.id, changes);

  const patch: TablesUpdate<"profiles"> = {};
  if (x.profile.zip && (await zipLocation(supabase, x.profile.zip))) patch.zip = x.profile.zip;
  if (x.profile.radius_mi) patch.radius_mi = x.profile.radius_mi;
  const prefs = await loadPrefs(supabase, profile.id);
  const visible = Object.fromEntries(Object.entries(prefs).filter(([k]) => !k.startsWith("_") && k !== LIFE_STORY_KEY));
  patch.ai_summary = await aiProfileSummary(visible, x.facts, usage);
  patch.profile_hash = profileHash(visible);
  await supabase.from("profiles").update(patch).eq("id", profile.id);

  return json({
    ok: true,
    reply: ai?.acknowledgement ?? (Object.keys(changes).length ? "Updated." : "I couldn't find anything to change in that. Try the chips below."),
    changed: Object.keys(changes),
    summary: patch.ai_summary,
  });
});
