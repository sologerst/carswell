import { z } from "zod";
import { env } from "@/lib/env";
import { ApiError, apiProfile, json, readJson, route } from "@/lib/server/api";
import { sendEmail } from "@/lib/server/email";
import { createAdminClient } from "@/lib/supabase/admin";

const Body = z.object({
  interestId: z.string().uuid(),
  shopId: z.string().uuid(),
  windows: z.array(z.object({ day: z.string().max(40), time: z.string().max(20) })).min(1).max(3),
  notes: z.string().max(1000).optional(),
});

/** Request a pre-purchase inspection at a local shop (private sales, Phase 3). */
export const POST = route(async (req: Request) => {
  const { supabase, profile } = await apiProfile();
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new ApiError(400, "Pick a shop and at least one time.");
  const b = parsed.data;
  const { data: interest } = await supabase.from("interests")
    .select("id, user_id, listing_id, seller_user_id, status, listing:listings(year, make, model, vin, zip)")
    .eq("id", b.interestId).maybeSingle();
  if (!interest || interest.user_id !== profile.id) throw new ApiError(404, "Car not found.");
  const { data: shop } = await supabase.from("inspection_shops").select("*").eq("id", b.shopId).maybeSingle();
  if (!shop) throw new ApiError(404, "Shop not found.");
  const admin = createAdminClient();
  const { data: open } = await admin.from("inspection_requests").select("id").eq("interest_id", b.interestId).in("status", ["requested", "confirmed"]).limit(1);
  if (open?.length) throw new ApiError(409, "You already have an inspection request for this car.");
  const { data: row, error } = await admin.from("inspection_requests").insert({
    user_id: profile.id, interest_id: b.interestId, listing_id: interest.listing_id, shop_id: shop.id,
    windows: b.windows as never, notes: b.notes ?? null,
  }).select("id").single();
  if (error) throw error;

  const l = interest.listing as unknown as { year: number; make: string; model: string; vin: string; zip: string | null };
  const title = `${l.year} ${l.make} ${l.model}`;
  if (shop.email) {
    await sendEmail({
      kind: "inspection_request",
      to: shop.email,
      subject: `Pre-purchase inspection request: ${title}`,
      text: `A ${env.appName} buyer (${profile.first_name ?? "a buyer"}) would like a pre-purchase inspection of a ${title} (VIN ${l.vin}).\nPreferred times: ${b.windows.map((w) => `${w.day} ${w.time}`).join(", ")}\n${b.notes ? `Notes: ${b.notes}\n` : ""}Reply to confirm a time; the buyer will coordinate with the seller.`,
      meta: { inspection_request_id: row.id, shop_id: shop.id },
    });
  }
  if (interest.seller_user_id) {
    await admin.from("notifications").insert({
      user_id: interest.seller_user_id, kind: "inspection", title: "The buyer wants an inspection",
      body: `${shop.name}: ${b.windows.map((w) => `${w.day} ${w.time}`).join(" or ")}`, url: `/sell/leads/${b.interestId}`,
    });
  }
  return json({ id: row.id });
});
