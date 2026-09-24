import "server-only";

import { mapFeedRows, parseCsv, type FeedError, type FeedRow } from "../inventory/csv";
import type { AdminSupabase } from "../supabase/admin";
import type { Tables, TablesInsert } from "../supabase/database.types";
import { recomputeCanonicalForVins } from "./canonical";
import { decodeVin, decodedBasics } from "./vin-decode";
import { normalizeBody } from "../inventory/normalize";
import { isPublicHttpsUrl } from "../url";

export { isPublicHttpsUrl };

export interface FeedImportResult {
  runId: string | null;
  rows: number;
  inserted: number;
  updated: number;
  removed: number;
  skipped: number;
  errors: FeedError[];
  unmapped: string[];
  pendingVerification: boolean;
}

const MAX_DECODES = 50;

/**
 * Import a dealer's CSV feed (Phase 2). Rows upsert by (dealer, VIN); with
 * replace=true, active feed cars missing from the file are marked sold.
 * Feed rows outrank every other source for the same VIN. Inventory from an
 * unverified dealership is held (review_status = pending) until an admin
 * verifies it.
 */
export async function importDealerFeed(admin: AdminSupabase, dealership: Tables<"dealerships">, csv: string, opts: { replace?: boolean } = {}): Promise<FeedImportResult> {
  const replace = opts.replace ?? true;
  const { data: run } = await admin.from("ingest_runs").insert({
    source: "dealer_feed", dealership_id: dealership.id, market_id: dealership.market_id, status: "running",
  }).select("id").single();

  const table = parseCsv(csv);
  const { rows, errors, unmapped } = mapFeedRows(table);

  // Fill missing year/make/model/body from the VIN (NHTSA), capped per import.
  let decodes = 0;
  const complete: FeedRow[] = [];
  for (const r of rows) {
    if ((!r.year || !r.make || !r.model || !r.body_style) && decodes < MAX_DECODES) {
      decodes++;
      const d = await decodeVin(r.vin).catch(() => null);
      const b = decodedBasics(d?.decode ?? null);
      r.year ??= b.year;
      r.make ??= b.make;
      r.model ??= b.model;
      r.trim ??= b.trim;
      r.body_style ??= normalizeBody(d?.decode?.["Body Class"], r.seats);
    }
    if (!r.year || !r.make || !r.model) { errors.push({ line: 0, vin: r.vin, error: "Missing year, make or model (and the VIN didn't decode)." }); continue; }
    if (!r.body_style) { errors.push({ line: 0, vin: r.vin, error: "Unknown body style. Add a body column (sedan, SUV, pickup...)." }); continue; }
    complete.push(r);
  }

  const reviewStatus = dealership.verified_at ? "approved" : "pending";
  const sourceId = (vin: string) => `${dealership.id}:${vin}`;
  const now = new Date().toISOString();

  // Existing feed rows for this dealer.
  const existing = new Map<string, { id: string; price: number; is_active: boolean }>();
  for (let from = 0; ; from += 1000) {
    const { data } = await admin.from("listings").select("id, source_id, price, is_active")
      .eq("source", "dealer_feed").eq("dealership_id", dealership.id).range(from, from + 999);
    for (const l of data ?? []) if (l.source_id) existing.set(l.source_id, { id: l.id, price: Number(l.price), is_active: l.is_active });
    if (!data || data.length < 1000) break;
  }

  const toRow = (r: FeedRow): TablesInsert<"listings"> => ({
    vin: r.vin, source: "dealer_feed", source_id: sourceId(r.vin), source_url: r.source_url, market_id: dealership.market_id,
    dealership_id: dealership.id, seller_type: "dealer", year: r.year!, make: r.make!, model: r.model!, trim_level: r.trim,
    body_style: r.body_style!, condition: r.condition, price: r.price, msrp: r.msrp, miles: r.condition === "new" ? Math.min(r.miles, 500) : r.miles,
    exterior_color: r.exterior_color, exterior_color_family: r.exterior_color_family, interior_color: r.interior_color,
    fuel_type: r.fuel_type, drivetrain: r.drivetrain, transmission: r.transmission, engine: r.engine, seats: r.seats,
    third_row: r.body_style === "three_row_suv" || r.body_style === "minivan" ? true : null,
    features: r.features, features_verified: false, description: r.description?.slice(0, 4000) ?? null, stock_number: r.stock_number,
    zip: dealership.zip, lat: dealership.lat ?? 36.1627, lng: dealership.lng ?? -86.7816,
    photo_count: r.photos.length, is_active: true, review_status: reviewStatus, last_seen_at: now, missed_sweeps: 0, sold_at: null,
    // Canonical is decided below, after demoting other sources' copies.
    is_canonical: false,
  });

  let inserted = 0;
  let updated = 0;
  const photoRows: TablesInsert<"listing_photos">[] = [];
  const touched: string[] = [];
  for (let i = 0; i < complete.length; i += 200) {
    const chunk = complete.slice(i, i + 200);
    const inserts = chunk.filter((r) => !existing.has(sourceId(r.vin))).map(toRow);
    if (inserts.length) {
      const { data, error } = await admin.from("listings").insert(inserts).select("id, vin");
      if (error) throw error;
      inserted += data.length;
      for (const l of data) {
        touched.push(l.id);
        const r = chunk.find((x) => x.vin === l.vin)!;
        r.photos.forEach((url, position) => photoRows.push({ listing_id: l.id, url, position }));
      }
    }
    for (const r of chunk.filter((x) => existing.has(sourceId(x.vin)))) {
      const cur = existing.get(sourceId(r.vin))!;
      const { is_canonical: _ignored, ...row } = toRow(r);
      void _ignored;
      const { error } = await admin.from("listings").update({ ...row, first_seen_at: cur.is_active ? undefined : now }).eq("id", cur.id);
      if (error) throw error;
      updated++;
      touched.push(cur.id);
      await admin.from("listing_photos").delete().eq("listing_id", cur.id);
      r.photos.forEach((url, position) => photoRows.push({ listing_id: cur.id, url, position }));
    }
  }
  for (let i = 0; i < photoRows.length; i += 500) {
    await admin.from("listing_photos").insert(photoRows.slice(i, i + 500));
  }

  // Cars no longer in a full feed are sold.
  let removed = 0;
  if (replace) {
    const present = new Set(complete.map((r) => sourceId(r.vin)));
    const gone = [...existing.entries()].filter(([sid, l]) => l.is_active && !present.has(sid)).map(([, l]) => l.id);
    for (let i = 0; i < gone.length; i += 200) {
      await admin.from("listings").update({ is_active: false, is_canonical: false, sold_at: now }).in("id", gone.slice(i, i + 200));
    }
    removed = gone.length;
  }

  if (reviewStatus === "approved") await recomputeCanonicalForVins(admin, complete.map((r) => r.vin));

  const result: FeedImportResult = {
    runId: run?.id ?? null, rows: rows.length, inserted, updated, removed,
    skipped: rows.length - complete.length, errors: errors.slice(0, 200), unmapped, pendingVerification: reviewStatus === "pending",
  };
  if (run) {
    await admin.from("ingest_runs").update({
      status: "succeeded", finished_at: new Date().toISOString(),
      stats: { rows: result.rows, inserted, updated, removed, skipped: result.skipped, errors: errors.length } as never,
    }).eq("id", run.id);
  }
  await admin.from("dealer_feeds").upsert({
    dealership_id: dealership.id, last_run_at: new Date().toISOString(), last_status: errors.length ? "partial" : "ok",
    last_stats: { inserted, updated, removed, skipped: result.skipped, errors: errors.length } as never, last_error: errors[0]?.error ?? null,
  });
  return result;
}

/** Scheduled pull of dealers' feed URLs (daily). */
export async function runDealerFeeds(admin: AdminSupabase, limit = 20) {
  const { data: feeds } = await admin.from("dealer_feeds").select("dealership_id, url").eq("enabled", true).not("url", "is", null).limit(limit);
  const results: Record<string, unknown> = {};
  for (const f of feeds ?? []) {
    try {
      if (!isPublicHttpsUrl(f.url!)) throw new Error("feed URL must be a public https address");
      const res = await fetch(f.url!, { signal: AbortSignal.timeout(30_000), redirect: "error" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (text.length > 10 * 1024 * 1024) throw new Error("feed larger than 10 MB");
      const { data: d } = await admin.from("dealerships").select("*").eq("id", f.dealership_id).single();
      if (!d) continue;
      const r = await importDealerFeed(admin, d, text, { replace: true });
      results[f.dealership_id] = { inserted: r.inserted, updated: r.updated, removed: r.removed, errors: r.errors.length };
    } catch (err) {
      results[f.dealership_id] = { error: String((err as Error).message ?? err) };
      await admin.from("dealer_feeds").update({ last_run_at: new Date().toISOString(), last_status: "failed", last_error: String((err as Error).message ?? err).slice(0, 500) }).eq("dealership_id", f.dealership_id);
    }
  }
  return results;
}
