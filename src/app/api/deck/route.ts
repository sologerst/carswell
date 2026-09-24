import { z } from "zod";
import { ApiError, apiProfile, json, readJson, route } from "@/lib/server/api";
import { getDeck } from "@/lib/server/deck";

const Body = z.object({
  exclude: z.array(z.string().uuid()).max(400).default([]),
  anchor: z.string().uuid().nullish(),
});

/** Next batch of ranked cards. POST so the client can send the ids it already holds. */
export const POST = route(async (req: Request) => {
  const { supabase, profile } = await apiProfile();
  if (!profile.onboarding_completed_at) throw new ApiError(409, "Finish onboarding first.");
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new ApiError(400, "Invalid deck request.");
  const deck = await getDeck(supabase, profile, { exclude: parsed.data.exclude, anchor: parsed.data.anchor });
  return json(deck);
});
