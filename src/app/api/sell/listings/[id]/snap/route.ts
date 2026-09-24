import sharp from "sharp";
import { z } from "zod";
import { aiSnap, featureChips } from "@/lib/ai/snap";
import { suggestPrivatePrice } from "@/lib/pricing";
import { ApiError, apiProfile, json, readJson, route } from "@/lib/server/api";
import { loadConfig } from "@/lib/server/data";
import { marketEstimate } from "@/lib/server/market";
import { loadOwnListing, PHOTO_BUCKET } from "@/lib/server/sell";
import { decodeVin } from "@/lib/server/vin-decode";
import { createAdminClient } from "@/lib/supabase/admin";

const Body = z.object({ notes: z.string().max(2000).default("") });

/**
 * Snap-to-list: photos + VIN -> suggested copy, features, damage notes and a
 * price range. The seller reviews and edits everything before publishing.
 */
export const POST = route(async (req: Request, ctx: RouteContext<"/api/sell/listings/[id]/snap">) => {
  const { id } = await ctx.params;
  const { supabase, profile } = await apiProfile();
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new ApiError(400, "Invalid request.");
  const admin = createAdminClient();
  const listing = await loadOwnListing(admin, profile.id, id);
  const config = await loadConfig(supabase);

  const { data: photos } = await admin.from("listing_photos").select("storage_path, position, quality")
    .eq("listing_id", id).order("position").limit(20);
  const images: { index: number; base64: string }[] = [];
  for (const [i, p] of (photos ?? []).slice(0, 4).entries()) {
    if (!p.storage_path) continue;
    const { data: blob } = await admin.storage.from(PHOTO_BUCKET).download(p.storage_path);
    if (!blob) continue;
    const small = await sharp(Buffer.from(await blob.arrayBuffer())).rotate().resize(1024, 1024, { fit: "inside" }).jpeg({ quality: 80 }).toBuffer();
    images.push({ index: i, base64: small.toString("base64") });
  }

  const [decoded, estimate] = await Promise.all([
    decodeVin(listing.vin).catch(() => null),
    marketEstimate(admin, { year: listing.year, make: listing.make, model: listing.model, trim: listing.trim_level, miles: listing.miles }),
  ]);
  const title = `${listing.year} ${listing.make} ${listing.model}${listing.trim_level ? ` ${listing.trim_level}` : ""}`;
  const snap = await aiSnap(
    { title, miles: listing.miles, decode: decoded?.decode ?? null, sellerNotes: parsed.data.notes, images },
    { store: admin, userId: profile.id, dailyBudgetUsd: config.ai.daily_budget_usd_per_user },
  );
  const suggestion = suggestPrivatePrice(estimate.expected);
  await admin.from("listings").update({
    listing_ai: { ...snap, generated_at: new Date().toISOString() } as never,
    expected_price: estimate.expected,
  }).eq("id", id);

  return json({
    snap: { ...snap, featureChips: featureChips(snap.features) },
    price: suggestion ? { ...suggestion, comps: estimate.comps, basis: estimate.basis } : null,
    photoIssues: (photos ?? []).map((p, i) => ({ photo: i + 1, issues: ((p.quality as { issues?: string[] } | null)?.issues ?? []) })).filter((p) => p.issues.length),
    recalls: decoded?.recalls.length ?? 0,
  });
});
