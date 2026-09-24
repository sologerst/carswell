import { z } from "zod";
import { ApiError, apiProfile, json, readJson, route } from "@/lib/server/api";

const Body = z.object({
  events: z.array(z.object({
    listing_id: z.string().uuid(),
    kind: z.enum(["impression", "detail_open", "brief_open", "photo_cycle", "more_like_this", "source_click"]),
    meta: z.record(z.string(), z.unknown()).refine((m) => JSON.stringify(m).length <= 1000, "meta too large").optional(),
  })).min(1).max(100),
});

/** Impressions and detail opens (feeds demand intelligence and listing stats). */
export const POST = route(async (req: Request) => {
  const { supabase, profile } = await apiProfile();
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new ApiError(400, "Invalid events.");
  const rows = parsed.data.events.map((e) => ({ user_id: profile.id, listing_id: e.listing_id, kind: e.kind, meta: (e.meta ?? {}) as never }));
  const { error } = await supabase.from("listing_events").insert(rows);
  if (error) throw new ApiError(400, error.message);
  return json({ ok: true, count: rows.length });
});
