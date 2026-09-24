import { z } from "zod";
import { ApiError, apiProfile, json, readJson, route } from "@/lib/server/api";
import { loadConfig } from "@/lib/server/data";
import { insuranceQuote } from "@/lib/server/partners";
import { createAdminClient } from "@/lib/supabase/admin";

const Body = z.object({ listingId: z.string().uuid(), coverage: z.enum(["liability", "full"]) });

/** Insurance quote for a specific car through the insurance partner (demo by default). */
export const POST = route(async (req: Request) => {
  const { supabase, profile } = await apiProfile();
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new ApiError(400, "Invalid request.");
  const { data: listing } = await supabase.from("listings").select("id, year, price").eq("id", parsed.data.listingId).maybeSingle();
  if (!listing) throw new ApiError(404, "Car not found.");
  const q = await insuranceQuote({ vehicleValue: Number(listing.price), year: listing.year, zip: profile.zip, coverage: parsed.data.coverage }, await loadConfig(supabase));
  await createAdminClient().from("insurance_quotes").insert({
    user_id: profile.id, listing_id: listing.id, partner: q.partner, carrier: q.carrier, monthly_premium: q.monthlyPremium,
    coverage: q.coverage as never, reference: q.reference, expires_at: q.expiresAt,
  });
  return json(q);
});
