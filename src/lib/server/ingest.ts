import "server-only";

import { env, features } from "../env";
import { colorFamily, normalizeBody, normalizeDrive, normalizeFuel } from "../inventory/normalize";
import type { AdminSupabase } from "../supabase/admin";
import { isValidVin } from "../vin";
import { recomputeCanonicalForVins } from "./canonical";

// MarketCheck sweep (Phase 4). Field names below follow MarketCheck's
// public v2 search API and are marked [VERIFY with MarketCheck] in the spec;
// the mapping lives in one function so it's easy to correct.

interface McListing {
  id: string;
  vin: string;
  price?: number;
  miles?: number;
  seller_type?: string;
  vdp_url?: string;
  heading?: string;
  exterior_color?: string;
  interior_color?: string;
  inventory_type?: string;
  media?: { photo_links?: string[] };
  dealer?: { id?: number; name?: string; zip?: string; latitude?: string; longitude?: string; website?: string };
  build?: {
    year?: number; make?: string; model?: string; trim?: string; body_type?: string; drivetrain?: string;
    fuel_type?: string; engine?: string; cylinders?: number; transmission?: string; doors?: number;
    std_seating?: string; city_mpg?: number; highway_mpg?: number;
  };
  source?: string;
}

// Scraped marketplaces are excluded by policy (their terms forbid scraping).
const EXCLUDED_DOMAINS = /facebook\.com|craigslist\.org/i;

export function mapMarketCheck(l: McListing, marketId: string) {
  const b = l.build ?? {};
  const seats = b.std_seating ? Number(b.std_seating) : null;
  const body = normalizeBody(b.body_type, seats);
  if (!body || !b.year || !b.make || !b.model || !l.price || !isValidVin(l.vin)) return null;
  if (EXCLUDED_DOMAINS.test(l.vdp_url ?? "") || EXCLUDED_DOMAINS.test(l.source ?? "")) return null;
  const lat = Number(l.dealer?.latitude);
  const lng = Number(l.dealer?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    listing: {
      vin: l.vin.toUpperCase(), source: "marketcheck" as const, source_id: l.id, source_url: l.vdp_url ?? null, market_id: marketId,
      seller_type: l.seller_type === "private" ? "private" : "dealer", year: b.year, make: b.make, model: b.model,
      trim_level: b.trim ?? null, body_style: body, condition: l.inventory_type === "new" ? "new" : "used",
      price: l.price, miles: l.miles ?? 0, exterior_color: l.exterior_color ?? null, exterior_color_family: colorFamily(l.exterior_color),
      interior_color: l.interior_color ?? null, fuel_type: normalizeFuel(b.fuel_type), drivetrain: normalizeDrive(b.drivetrain),
      engine: b.engine ?? null, cylinders: b.cylinders ?? null, doors: b.doors ?? null, seats,
      third_row: seats ? seats >= 7 : null, mpg_city: b.city_mpg ?? null, mpg_hwy: b.highway_mpg ?? null,
      zip: l.dealer?.zip ?? null, lat, lng, photo_count: l.media?.photo_links?.length ?? 0,
      last_seen_at: new Date().toISOString(), missed_sweeps: 0, is_active: true,
    },
    photos: (l.media?.photo_links ?? []).slice(0, 12),
  };
}

export async function runIngest(admin: AdminSupabase) {
  if (!features.marketcheck) {
    return { skipped: "No MARKETCHECK_API_KEY or INVENTORY_SOURCES excludes marketcheck; fixtures come from the seed." };
  }
  const { data: markets } = await admin.from("markets").select("id, center_zip, radius_mi").eq("is_active", true).order("priority");
  const month = new Date().toISOString().slice(0, 7);
  const { data: runs } = await admin.from("ingest_runs").select("stats").eq("source", "marketcheck").gte("started_at", `${month}-01`);
  let callsThisMonth = (runs ?? []).reduce((s, r) => s + Number((r.stats as { calls?: number }).calls ?? 0), 0);
  const budget = env.marketcheckMonthlyCallBudget || Infinity;
  const results: Record<string, unknown> = {};

  for (const [i, market] of (markets ?? []).entries()) {
    // Budget guard: pause non-priority markets at 90% of the monthly budget.
    if (i > 0 && callsThisMonth >= budget * 0.9) {
      results[market.id] = "paused (budget)";
      continue;
    }
    const { data: zip } = await admin.from("zip_codes").select("lat, lng").eq("zip", market.center_zip).single();
    if (!zip) continue;
    const { data: run } = await admin.from("ingest_runs").insert({ market_id: market.id, source: "marketcheck" }).select("id").single();
    const seen = new Set<string>();
    let calls = 0;
    let upserted = 0;
    try {
      for (let start = 0; start < 5000; start += 50) {
        if (callsThisMonth + calls >= budget) break;
        const url = `${env.marketcheckApiBase}/search/car/active?api_key=${env.marketcheckApiKey}&latitude=${zip.lat}&longitude=${zip.lng}&radius=${market.radius_mi}&start=${start}&rows=50`;
        const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
        calls++;
        if (!res.ok) throw new Error(`MarketCheck ${res.status}`);
        const body = (await res.json()) as { listings?: McListing[]; num_found?: number };
        const mapped = (body.listings ?? []).map((l) => mapMarketCheck(l, market.id)).filter((x): x is NonNullable<typeof x> => x !== null);
        for (const m of mapped) {
          const { data: row } = await admin.from("listings").upsert(m.listing, { onConflict: "source,source_id" }).select("id").single();
          if (row) {
            seen.add(row.id);
            upserted++;
            if (m.photos.length) {
              await admin.from("listing_photos").upsert(m.photos.map((url, position) => ({ listing_id: row.id, url, position })), { onConflict: "listing_id,position" });
            }
          }
        }
        if (!body.listings?.length || start + 50 >= (body.num_found ?? 0)) break;
        await new Promise((r) => setTimeout(r, 1000 / Math.max(env.marketcheckMaxRps, 1)));
      }
      // Missed sweeps: listings not seen this run count toward removal (2 misses).
      const { data: existing } = await admin.from("listings").select("id, missed_sweeps").eq("source", "marketcheck").eq("market_id", market.id).eq("is_active", true);
      for (const l of existing ?? []) {
        if (!seen.has(l.id)) await admin.from("listings").update({ missed_sweeps: l.missed_sweeps + 1 }).eq("id", l.id);
      }
      await recomputeCanonical(admin, market.id);
      callsThisMonth += calls;
      await admin.from("ingest_runs").update({ status: "succeeded", finished_at: new Date().toISOString(), stats: { calls, upserted } }).eq("id", run!.id);
      results[market.id] = { calls, upserted };
    } catch (err) {
      await admin.from("ingest_runs").update({ status: "failed", finished_at: new Date().toISOString(), error: String(err), stats: { calls, upserted } }).eq("id", run!.id);
      results[market.id] = { error: String(err) };
    }
  }
  return results;
}

/** Re-pick one canonical card per VIN within a market (paged, VIN-ordered). */
async function recomputeCanonical(admin: AdminSupabase, marketId: string) {
  const vins = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data } = await admin.from("listings").select("vin").eq("market_id", marketId).eq("is_active", true)
      .order("vin").range(from, from + 999);
    for (const r of data ?? []) vins.add(r.vin);
    if (!data || data.length < 1000) break;
  }
  await recomputeCanonicalForVins(admin, [...vins]);
}
