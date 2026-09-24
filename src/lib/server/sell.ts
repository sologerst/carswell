import "server-only";

import type { AppConfig } from "../config";
import { dealBand } from "../deal";
import { colorFamily } from "../inventory/normalize";
import { styleEmbedding } from "../inventory/style-embedding";
import { suggestPrivatePrice } from "../pricing";
import { assessListing, scrubContactInfo, type RiskAssessment, type RiskFlag } from "../safety/listing-risk";
import type { AdminSupabase } from "../supabase/admin";
import type { Tables } from "../supabase/database.types";
import type { BodyStyle, Drivetrain, FuelType } from "../types";
import { isValidVin } from "../vin";
import { loadConfigAdmin } from "./admin-data";
import { ApiError } from "./api";
import { dHash, photoQuality } from "./images";
import { marketEstimate } from "./market";
import type { Profile } from "./session";
import { decodeVin, decodedBasics } from "./vin-decode";

export const PHOTO_BUCKET = "listing-photos";

/** Blocks the seller can fix themselves; the listing stays a draft. */
const FIXABLE = new Set(["phone_unverified", "too_few_photos", "vin_invalid", "curbstoning_cap"]);

export interface DraftInput {
  vin: string;
  year: number;
  make: string;
  model: string;
  trim?: string | null;
  miles: number;
  body_style: BodyStyle;
  fuel_type?: FuelType;
  drivetrain?: Drivetrain | null;
  transmission?: "automatic" | "manual" | "cvt" | null;
  exterior_color?: string | null;
  zip: string;
}

export async function loadOwnListing(admin: AdminSupabase, sellerId: string, listingId: string): Promise<Tables<"listings">> {
  const { data } = await admin.from("listings").select("*").eq("id", listingId).eq("private_seller_id", sellerId)
    .eq("source", "private").maybeSingle();
  if (!data) throw new ApiError(404, "Listing not found.");
  return data;
}

/** Create (or return the existing) draft for this seller + VIN. */
export async function createDraft(admin: AdminSupabase, seller: Profile, input: DraftInput, config: AppConfig) {
  const vin = input.vin.trim().toUpperCase();
  if (!isValidVin(vin)) throw new ApiError(400, "That VIN doesn't pass the check-digit test.");
  const { data: existing } = await admin.from("listings").select("id").eq("private_seller_id", seller.id)
    .eq("vin", vin).eq("review_status", "draft").maybeSingle();
  if (existing) return existing.id;

  const { data: zip } = await admin.from("zip_codes").select("zip, lat, lng").eq("zip", input.zip).maybeSingle();
  if (!zip) throw new ApiError(400, "We don't serve that ZIP code yet.");
  const estimate = await marketEstimate(admin, { year: input.year, make: input.make, model: input.model, trim: input.trim, miles: input.miles });
  const suggestion = suggestPrivatePrice(estimate.expected);

  const { data, error } = await admin.from("listings").insert({
    vin,
    source: "private",
    seller_type: "private",
    private_seller_id: seller.id,
    market_id: config.launch_market.id,
    year: input.year,
    make: input.make.trim(),
    model: input.model.trim(),
    trim_level: input.trim?.trim() || null,
    body_style: input.body_style,
    condition: "used",
    // Placeholder until the seller sets a price (drafts are never shown).
    price: suggestion?.expected ?? 1000,
    miles: input.miles,
    fuel_type: input.fuel_type ?? "gas",
    drivetrain: input.drivetrain ?? null,
    transmission: input.transmission ?? null,
    exterior_color: input.exterior_color ?? null,
    exterior_color_family: colorFamily(input.exterior_color),
    zip: zip.zip,
    lat: zip.lat,
    lng: zip.lng,
    expected_price: estimate.expected,
    is_active: false,
    is_canonical: false,
    review_status: "draft",
    personal_use: true,
  }).select("id").single();
  if (error) throw error;
  return data.id;
}

export interface DraftPatch {
  price?: number;
  miles?: number;
  description?: string;
  features?: string[];
  exterior_color?: string | null;
  interior_color?: string | null;
  title_status?: "clean" | "rebuilt" | "salvage" | "lemon";
  accident_count?: number | null;
  owner_count?: number | null;
  service_records?: boolean | null;
  trim?: string | null;
}

export async function updateListing(admin: AdminSupabase, seller: Profile, listingId: string, patch: DraftPatch) {
  const listing = await loadOwnListing(admin, seller.id, listingId);
  if (!["draft", "approved"].includes(listing.review_status)) throw new ApiError(409, "This listing can't be edited right now.");
  const update: Partial<Tables<"listings">> = {};
  if (patch.price !== undefined) update.price = patch.price;
  if (patch.miles !== undefined) {
    if (listing.review_status === "approved" && patch.miles < listing.miles) throw new ApiError(400, "Mileage can't go down on a live listing.");
    update.miles = patch.miles;
  }
  if (patch.description !== undefined) update.description = scrubContactInfo(patch.description).text.slice(0, 4000);
  if (patch.features !== undefined) update.features = [...new Set(patch.features)].slice(0, 60);
  if (patch.exterior_color !== undefined) {
    update.exterior_color = patch.exterior_color;
    update.exterior_color_family = colorFamily(patch.exterior_color);
  }
  if (patch.interior_color !== undefined) update.interior_color = patch.interior_color;
  if (patch.title_status !== undefined) update.title_status = patch.title_status;
  if (patch.accident_count !== undefined) update.accident_count = patch.accident_count;
  if (patch.owner_count !== undefined) update.owner_count = patch.owner_count;
  if (patch.service_records !== undefined) update.service_records = patch.service_records;
  if (patch.trim !== undefined) update.trim_level = patch.trim;
  if (listing.review_status === "approved" && update.price !== undefined) {
    update.deal_rating = dealBand(update.price, listing.expected_price);
  }
  // A live listing whose description changed is re-screened for scam text.
  if (listing.review_status === "approved" && update.description !== undefined) {
    const { assessment } = await gatherAndAssess(admin, seller, { ...listing, ...update } as Tables<"listings">, await loadConfigAdmin(admin));
    if (assessment.decision !== "approve") {
      update.is_active = false;
      update.review_status = assessment.decision === "block" ? "rejected" : "pending";
      update.moderation = { flags: assessment.flags, decision: assessment.decision, decided_at: new Date().toISOString(), by: "auto" } as never;
      update.risk_score = assessment.score;
    }
  }
  const { error } = await admin.from("listings").update(update).eq("id", listingId);
  if (error) throw error;
}

/** Register uploaded photos (already in storage under "<seller>/<listing>/"). */
export async function registerPhotos(admin: AdminSupabase, seller: Profile, listingId: string, paths: string[], config: AppConfig) {
  const listing = await loadOwnListing(admin, seller.id, listingId);
  if (!["draft", "approved"].includes(listing.review_status)) throw new ApiError(409, "This listing can't be edited right now.");
  const prefix = `${seller.id}/${listingId}/`;
  if (paths.some((p) => !p.startsWith(prefix) || p.includes(".."))) throw new ApiError(400, "Invalid photo path.");

  const { data: current } = await admin.from("listing_photos").select("position, storage_path").eq("listing_id", listingId);
  const known = new Set((current ?? []).map((p) => p.storage_path));
  const fresh = paths.filter((p) => !known.has(p));
  if ((current?.length ?? 0) + fresh.length > config.private_sales.max_photos) {
    throw new ApiError(400, `Up to ${config.private_sales.max_photos} photos.`);
  }
  let position = Math.max(-1, ...(current ?? []).map((p) => p.position)) + 1;
  const added: { id: string; url: string; quality: { issues: string[] } }[] = [];
  for (const path of fresh) {
    const { data: blob, error } = await admin.storage.from(PHOTO_BUCKET).download(path);
    if (error || !blob) throw new ApiError(400, "A photo didn't finish uploading. Try again.");
    const buf = Buffer.from(await blob.arrayBuffer());
    const [hash, quality] = await Promise.all([dHash(buf), photoQuality(buf)]);
    const url = admin.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
    const { data: row, error: insErr } = await admin.from("listing_photos").insert({
      listing_id: listingId, url, position: position++, storage_path: path, phash: hash,
      width: quality.width, height: quality.height, quality: quality as never,
    }).select("id").single();
    if (insErr) throw insErr;
    added.push({ id: row.id, url, quality });
  }
  const { count } = await admin.from("listing_photos").select("id", { count: "exact", head: true }).eq("listing_id", listingId);
  await admin.from("listings").update({ photo_count: count ?? 0 }).eq("id", listingId);
  return added;
}

export async function removePhoto(admin: AdminSupabase, seller: Profile, listingId: string, photoId: string) {
  await loadOwnListing(admin, seller.id, listingId);
  const { data: photo } = await admin.from("listing_photos").select("id, storage_path").eq("id", photoId).eq("listing_id", listingId).maybeSingle();
  if (!photo) throw new ApiError(404, "Photo not found.");
  await admin.from("listing_photos").delete().eq("id", photoId);
  if (photo.storage_path) await admin.storage.from(PHOTO_BUCKET).remove([photo.storage_path]);
  const { count } = await admin.from("listing_photos").select("id", { count: "exact", head: true }).eq("listing_id", listingId);
  await admin.from("listings").update({ photo_count: count ?? 0 }).eq("id", listingId);
}

/** Collect the facts moderation needs and run the rules. */
export async function gatherAndAssess(admin: AdminSupabase, seller: Profile, listing: Tables<"listings">, config: AppConfig): Promise<{
  assessment: RiskAssessment; expected: number | null;
}> {
  const [decoded, elsewhere, photos, estimate, history] = await Promise.all([
    decodeVin(listing.vin).catch(() => null),
    admin.from("listings").select("id, seller_type, source, private_seller_id")
      .eq("vin", listing.vin).eq("is_active", true).neq("id", listing.id),
    admin.from("listing_photos").select("phash").eq("listing_id", listing.id).not("phash", "is", null),
    marketEstimate(admin, { year: listing.year, make: listing.make, model: listing.model, trim: listing.trim_level, miles: listing.miles }),
    admin.from("listings").select("id, vin, review_status, published_at")
      .eq("private_seller_id", seller.id).eq("source", "private").neq("id", listing.id),
  ]);

  const hashes = (photos.data ?? []).map((p) => String(p.phash));
  let reused = 0;
  let exact = 0;
  if (hashes.length) {
    const { data: matches } = await admin.rpc("similar_photos", {
      p_hashes: hashes, p_max_distance: config.moderation.phash_max_distance, p_exclude_listing: listing.id,
    });
    const otherIds = [...new Set((matches ?? []).map((m) => m.listing_id))];
    // The seller's own earlier listings (a relist) don't count.
    const { data: owners } = otherIds.length
      ? await admin.from("listings").select("id, private_seller_id").in("id", otherIds)
      : { data: [] };
    const foreign = new Set((owners ?? []).filter((o) => o.private_seller_id !== seller.id).map((o) => o.id));
    for (const m of matches ?? []) {
      if (!foreign.has(m.listing_id)) continue;
      reused++;
      if (m.distance <= 2) exact++;
    }
  }

  const yearAgo = Date.now() - 365 * 86_400_000;
  const history_ = history.data ?? [];
  const basics = decodedBasics(decoded?.decode ?? null);
  const assessment = assessListing({
    vinValid: isValidVin(listing.vin),
    decoded: decoded?.decode ? basics : null,
    claimed: { year: listing.year, make: listing.make, model: listing.model },
    price: Number(listing.price),
    expectedPrice: estimate.expected,
    description: listing.description ?? "",
    vinElsewhere: {
      atDealer: (elsewhere.data ?? []).some((r) => r.seller_type === "dealer"),
      otherPrivateSeller: (elsewhere.data ?? []).some((r) => r.source === "private" && r.private_seller_id !== seller.id),
    },
    reusedPhotos: reused,
    reusedPhotosExact: exact,
    // Relisting the same car doesn't count toward the yearly cap.
    sellerListingsLastYear: new Set(history_.filter((h) => h.published_at && new Date(h.published_at).getTime() > yearAgo && h.vin !== listing.vin).map((h) => h.vin)).size,
    phoneVerified: Boolean(seller.phone_verified_at),
    photoCount: hashes.length || listing.photo_count,
    sellerRejections: history_.filter((h) => h.review_status === "rejected").length,
  }, config);
  return { assessment, expected: estimate.expected };
}

export type PublishResult =
  | { status: "approved" | "pending" | "rejected"; flags: RiskFlag[] }
  | { status: "needs_fix"; flags: RiskFlag[] };

export async function publishListing(admin: AdminSupabase, seller: Profile, listingId: string, config: AppConfig): Promise<PublishResult> {
  const listing = await loadOwnListing(admin, seller.id, listingId);
  if (listing.review_status !== "draft") throw new ApiError(409, "This listing was already submitted.");
  if (!listing.description?.trim()) throw new ApiError(400, "Add a description first.");

  const { assessment, expected } = await gatherAndAssess(admin, seller, listing, config);
  const moderation = { flags: assessment.flags, decision: assessment.decision, decided_at: new Date().toISOString(), by: "auto" };

  // Known scam patterns win over fixable issues: those listings are rejected
  // and audited even if, say, the phone isn't verified yet.
  const scamBlocks = assessment.flags.filter((f) => f.severity === "block" && !FIXABLE.has(f.code));
  const fixable = assessment.flags.filter((f) => f.severity === "block" && FIXABLE.has(f.code));
  if (fixable.length && !scamBlocks.length) {
    await admin.from("listings").update({ moderation: moderation as never, risk_score: assessment.score }).eq("id", listingId);
    return { status: "needs_fix", flags: fixable };
  }

  if (assessment.decision === "block") {
    await admin.from("listings").update({ review_status: "rejected", moderation: moderation as never, risk_score: assessment.score }).eq("id", listingId);
    await admin.from("admin_audit_log").insert({
      actor_id: null, action: "listing.auto_rejected", target: listingId,
      details: { seller_id: seller.id, vin: listing.vin, flags: assessment.flags } as never,
    });
    return { status: "rejected", flags: assessment.flags };
  }

  if (assessment.decision === "review") {
    await admin.from("listings").update({ review_status: "pending", moderation: moderation as never, risk_score: assessment.score, expected_price: expected }).eq("id", listingId);
    const { data: admins } = await admin.from("profiles").select("id").eq("is_admin", true);
    if (admins?.length) {
      await admin.from("notifications").insert(admins.map((a) => ({
        user_id: a.id, kind: "moderation", title: "Private listing to review",
        body: `${listing.year} ${listing.make} ${listing.model}`, url: "/admin/moderation",
      })));
    }
    return { status: "pending", flags: assessment.flags };
  }

  await goLive(admin, listing, expected, moderation);
  return { status: "approved", flags: assessment.flags };
}

/** Make a private listing live: canonical for its VIN, rated, embedded. */
export async function goLive(admin: AdminSupabase, listing: Tables<"listings">, expected: number | null, moderation: Record<string, unknown>) {
  // In-app private listings outrank aggregated copies of the same car.
  await admin.from("listings").update({ is_canonical: false })
    .eq("vin", listing.vin).eq("is_canonical", true).eq("is_active", true).neq("id", listing.id);
  const now = new Date().toISOString();
  const { error } = await admin.from("listings").update({
    review_status: "approved",
    is_active: true,
    is_canonical: true,
    published_at: now,
    first_seen_at: now,
    last_seen_at: now,
    sold_at: null,
    expected_price: expected ?? listing.expected_price,
    deal_rating: dealBand(Number(listing.price), expected ?? listing.expected_price),
    moderation: moderation as never,
  }).eq("id", listing.id);
  if (error) throw error;
  const emb = styleEmbedding({
    make: listing.make, body_style: listing.body_style as BodyStyle, fuel_type: listing.fuel_type,
    exterior_color_family: listing.exterior_color_family, trim_level: listing.trim_level,
    features: listing.features ?? [], length_in: listing.length_in,
  });
  await admin.from("listing_embeddings").upsert({ listing_id: listing.id, model: "attribute-style-v1", embedding: `[${emb.join(",")}]` });
}

export async function setListingState(admin: AdminSupabase, seller: Profile, listingId: string, action: "sold" | "pause" | "relist" | "delete") {
  const listing = await loadOwnListing(admin, seller.id, listingId);
  switch (action) {
    case "sold":
      await admin.from("listings").update({ is_active: false, sold_at: new Date().toISOString() }).eq("id", listingId);
      break;
    case "pause":
      await admin.from("listings").update({ is_active: false }).eq("id", listingId);
      break;
    case "relist": {
      if (listing.review_status !== "approved") throw new ApiError(409, "Only approved listings can be relisted.");
      const { data: clash } = await admin.from("listings").select("id").eq("vin", listing.vin).eq("is_active", true)
        .eq("seller_type", "dealer").limit(1);
      if (clash?.length) throw new ApiError(409, "This VIN is listed at a dealership now.");
      await goLive(admin, listing, listing.expected_price === null ? null : Number(listing.expected_price), listing.moderation as Record<string, unknown>);
      break;
    }
    case "delete": {
      const { count } = await admin.from("interests").select("id", { count: "exact", head: true }).eq("listing_id", listingId);
      if (count) {
        // Buyers who liked it keep a "Sold" card; just take it down.
        await admin.from("listings").update({ is_active: false, review_status: "removed" }).eq("id", listingId);
      } else {
        const { data: photos } = await admin.from("listing_photos").select("storage_path").eq("listing_id", listingId);
        const paths = (photos ?? []).map((p) => p.storage_path).filter((p): p is string => Boolean(p));
        if (paths.length) await admin.storage.from(PHOTO_BUCKET).remove(paths);
        await admin.from("listings").delete().eq("id", listingId);
      }
      break;
    }
  }
}
