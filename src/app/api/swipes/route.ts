import { after } from "next/server";
import { z } from "zod";
import { ApiError, apiProfile, json, readJson, route } from "@/lib/server/api";
import { dispatchLeads } from "@/lib/server/leads";
import { pushPendingNotifications } from "@/lib/server/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { features } from "@/lib/env";

const Swipe = z.object({
  client_id: z.string().uuid(),
  listing_id: z.string().uuid().optional(),
  action: z.enum(["pass", "like", "superlike", "undo"]),
  swiped_at: z.string().datetime().optional(),
  position: z.number().int().optional(),
  exploration: z.boolean().optional(),
  score: z.number().optional(),
  undo_of: z.string().uuid().optional(),
  test_drive_windows: z.array(z.object({ day: z.string().max(40), time: z.string().max(40) })).max(3).optional(),
});
const Body = z.object({ swipes: z.array(Swipe).min(1).max(200) });

interface SwipeResult {
  client_id: string;
  status: string;
  interest_id?: string;
}

/** Flush queued swipes. Idempotent: replays of the same client_id are no-ops. */
export const POST = route(async (req: Request) => {
  const { supabase } = await apiProfile();
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new ApiError(400, "Invalid swipes.");

  const { data, error } = await supabase.rpc("record_swipes", { p_swipes: parsed.data.swipes as never });
  if (error) throw new ApiError(400, error.message);
  const results = (data ?? []) as unknown as SwipeResult[];

  // Deliver new leads right away instead of waiting for the next cron tick.
  const interestIds = results.map((r) => r.interest_id).filter((x): x is string => Boolean(x));
  if (interestIds.length && features.adminClient) {
    after(async () => {
      const admin = createAdminClient();
      await dispatchLeads(admin, { interestIds });
      await pushPendingNotifications(admin);
    });
  }
  return json({ results });
});
