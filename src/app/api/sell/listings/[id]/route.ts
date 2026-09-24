import { z } from "zod";
import { ApiError, apiProfile, json, readJson, route } from "@/lib/server/api";
import { setListingState, updateListing } from "@/lib/server/sell";
import { createAdminClient } from "@/lib/supabase/admin";

const Patch = z.object({
  price: z.number().min(500).max(2_000_000).optional(),
  miles: z.number().int().min(0).max(999_999).optional(),
  description: z.string().max(4000).optional(),
  features: z.array(z.string().regex(/^[a-z0-9_]{2,40}$/)).max(60).optional(),
  exterior_color: z.string().trim().max(40).nullable().optional(),
  interior_color: z.string().trim().max(40).nullable().optional(),
  title_status: z.enum(["clean", "rebuilt", "salvage", "lemon"]).optional(),
  accident_count: z.number().int().min(0).max(20).nullable().optional(),
  owner_count: z.number().int().min(1).max(20).nullable().optional(),
  service_records: z.boolean().nullable().optional(),
  trim: z.string().trim().max(60).nullable().optional(),
});

export const PATCH = route(async (req: Request, ctx: RouteContext<"/api/sell/listings/[id]">) => {
  const { id } = await ctx.params;
  const { profile } = await apiProfile();
  const parsed = Patch.safeParse(await readJson(req));
  if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid listing details.");
  await updateListing(createAdminClient(), profile, id, parsed.data);
  return json({ ok: true });
});

const Action = z.object({ action: z.enum(["sold", "pause", "relist", "delete"]) });

export const POST = route(async (req: Request, ctx: RouteContext<"/api/sell/listings/[id]">) => {
  const { id } = await ctx.params;
  const { profile } = await apiProfile();
  const parsed = Action.safeParse(await readJson(req));
  if (!parsed.success) throw new ApiError(400, "Unknown action.");
  await setListingState(createAdminClient(), profile, id, parsed.data.action);
  return json({ ok: true });
});
