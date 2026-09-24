import { z } from "zod";
import { dealBand } from "@/lib/deal";
import { ApiError, apiDealer, json, readJson, route } from "@/lib/server/api";
import { startPromotion } from "@/lib/server/billing";
import { recomputeCanonicalForVins } from "@/lib/server/canonical";
import { loadConfig } from "@/lib/server/data";
import { createAdminClient } from "@/lib/supabase/admin";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("price"), price: z.number().min(500).max(2_000_000) }),
  z.object({ action: z.literal("sold") }),
  z.object({ action: z.literal("relist") }),
  z.object({ action: z.literal("promote") }),
]);

/** Inventory actions for a dealer's own listing. */
export const POST = route(async (req: Request, ctx: RouteContext<"/api/dealer/listings/[id]">) => {
  const { id } = await ctx.params;
  const { supabase, profile, dealership } = await apiDealer();
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new ApiError(400, "Invalid action.");
  const admin = createAdminClient();
  const { data: listing } = await admin.from("listings").select("id, vin, price, expected_price, is_active, review_status")
    .eq("id", id).eq("dealership_id", dealership.id).maybeSingle();
  if (!listing) throw new ApiError(404, "Listing not found.");

  switch (parsed.data.action) {
    case "price":
      await admin.from("listings").update({ price: parsed.data.price, deal_rating: dealBand(parsed.data.price, listing.expected_price === null ? null : Number(listing.expected_price)) }).eq("id", id);
      return json({ ok: true });
    case "sold":
      await admin.from("listings").update({ is_active: false, is_canonical: false, sold_at: new Date().toISOString() }).eq("id", id);
      await recomputeCanonicalForVins(admin, [listing.vin]);
      return json({ ok: true });
    case "relist":
      await admin.from("listings").update({ is_active: true, sold_at: null, missed_sweeps: 0, last_seen_at: new Date().toISOString() }).eq("id", id);
      await recomputeCanonicalForVins(admin, [listing.vin]);
      return json({ ok: true });
    case "promote": {
      if (!listing.is_active || listing.review_status !== "approved") throw new ApiError(409, "Only live listings can be promoted.");
      const res = await startPromotion(admin, dealership, id, profile.id, profile.email, await loadConfig(supabase));
      return json(res);
    }
  }
});
