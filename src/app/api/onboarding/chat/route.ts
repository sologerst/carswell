import { z } from "zod";
import { ApiError, apiProfile, json, readJson, route } from "@/lib/server/api";
import { onboardingTurn } from "@/lib/server/onboarding";

const Body = z.object({
  message: z.string().max(4000).optional(),
  chip: z.object({
    slot: z.enum(["budget", "location", "condition", "body", "seats", "fuel", "history", "trade", "timeline", "taste"]),
    value: z.string().max(200),
  }).optional(),
});

/** One conversational onboarding turn: extract what we can, ask for the next gap. */
export const POST = route(async (req: Request) => {
  const { supabase, profile } = await apiProfile();
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new ApiError(400, "Invalid onboarding message.");
  return json(await onboardingTurn(supabase, profile, parsed.data));
});
