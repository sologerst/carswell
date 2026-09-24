import { apiProfile, json, route } from "@/lib/server/api";
import { loadConfig } from "@/lib/server/data";
import { publishListing } from "@/lib/server/sell";
import { createAdminClient } from "@/lib/supabase/admin";

/** Run moderation and publish (live, in review, blocked, or needs a fix). */
export const POST = route(async (_req: Request, ctx: RouteContext<"/api/sell/listings/[id]/publish">) => {
  const { id } = await ctx.params;
  const { supabase, profile } = await apiProfile();
  const result = await publishListing(createAdminClient(), profile, id, await loadConfig(supabase));
  return json(result);
});
