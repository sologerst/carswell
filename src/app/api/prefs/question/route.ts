import { z } from "zod";
import { nextQuestion } from "@/lib/deck/progressive";
import { ApiError, apiProfile, json, readJson, route } from "@/lib/server/api";
import { loadAffinities, loadConfig, loadPrefs, upsertPrefs } from "@/lib/server/data";

const Body = z.object({ questionId: z.string().max(120), option: z.number().int().min(-1).max(5) });

/** Answer (or dismiss with option -1) a progressive-profiling question. */
export const POST = route(async (req: Request) => {
  const { supabase, profile } = await apiProfile();
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new ApiError(400, "Invalid answer.");

  const [config, prefs, affinities] = await Promise.all([
    loadConfig(supabase), loadPrefs(supabase, profile.id), loadAffinities(supabase, profile.id),
  ]);
  // Recompute the question server-side so the client can't set arbitrary prefs.
  const q = nextQuestion({
    swipes: profile.swipe_count,
    lastQuestionSwipe: profile.last_question_swipe,
    every: config.limits.questions_every_swipes,
    affinities,
    prefs,
    dismissed: profile.dismissed_questions ?? [],
  });
  if (q && q.id === parsed.data.questionId && parsed.data.option >= 0) {
    const set = q.options[parsed.data.option]?.set;
    if (set) {
      const prev = prefs[set.key];
      const value = set.merge && Array.isArray(set.value)
        ? [...new Set([...((prev?.value as unknown[]) ?? []), ...set.value])]
        : set.value;
      await upsertPrefs(supabase, profile.id, { [set.key]: { value, tier: set.tier, source: "swiped" } });
    }
  }
  await supabase.from("profiles").update({
    last_question_swipe: profile.swipe_count,
    dismissed_questions: [...new Set([...(profile.dismissed_questions ?? []), parsed.data.questionId])].slice(-100),
  }).eq("id", profile.id);
  return json({ ok: true });
});
