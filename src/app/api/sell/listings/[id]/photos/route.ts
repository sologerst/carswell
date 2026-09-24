import { z } from "zod";
import { ApiError, apiProfile, json, readJson, route } from "@/lib/server/api";
import { loadConfig } from "@/lib/server/data";
import { registerPhotos, removePhoto } from "@/lib/server/sell";
import { createAdminClient } from "@/lib/supabase/admin";

const Body = z.object({ paths: z.array(z.string().max(300)).min(1).max(20) });

/** Register photos the seller uploaded to storage; hashes them for moderation. */
export const POST = route(async (req: Request, ctx: RouteContext<"/api/sell/listings/[id]/photos">) => {
  const { id } = await ctx.params;
  const { supabase, profile } = await apiProfile();
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new ApiError(400, "Invalid photos.");
  const added = await registerPhotos(createAdminClient(), profile, id, parsed.data.paths, await loadConfig(supabase));
  return json({ photos: added });
});

export const DELETE = route(async (req: Request, ctx: RouteContext<"/api/sell/listings/[id]/photos">) => {
  const { id } = await ctx.params;
  const { profile } = await apiProfile();
  const photoId = new URL(req.url).searchParams.get("photo");
  if (!photoId || !/^[0-9a-f-]{36}$/.test(photoId)) throw new ApiError(400, "Which photo?");
  await removePhoto(createAdminClient(), profile, id, photoId);
  return json({ ok: true });
});
