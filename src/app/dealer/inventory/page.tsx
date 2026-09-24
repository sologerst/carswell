import type { Metadata } from "next";
import { InventoryView, type InventoryRow } from "@/components/dealer/inventory-view";
import { msAgo } from "@/lib/format";
import { SAMPLE_FEED_CSV } from "@/lib/inventory/csv";
import { loadConfig } from "@/lib/server/data";
import { requireDealer } from "@/lib/server/session";
import { createClient } from "@/lib/supabase/server";
import type { DealRating } from "@/lib/types";

export const metadata: Metadata = { title: "Inventory" };

export default async function InventoryPage() {
  const { membership } = await requireDealer();
  const supabase = await createClient();
  const id = membership.dealership_id;
  const [config, { data: listings }, { data: stats }, { data: feed }] = await Promise.all([
    loadConfig(supabase),
    supabase.from("listings")
      .select("id, vin, year, make, model, trim_level, price, miles, deal_rating, is_active, is_canonical, review_status, sold_at, first_seen_at, promoted_until, source, stock_number, listing_photos(url, position)")
      .eq("dealership_id", id).order("is_active", { ascending: false }).order("first_seen_at", { ascending: false }).limit(1000),
    supabase.rpc("dealer_inventory_stats", { p_dealership_id: id, p_days: 30 }),
    supabase.from("dealer_feeds").select("*").eq("dealership_id", id).maybeSingle(),
  ]);
  const byId = new Map((stats ?? []).map((s) => [s.listing_id, s]));
  const rows: InventoryRow[] = (listings ?? []).map((l) => {
    const s = byId.get(l.id);
    const state: InventoryRow["state"] = l.sold_at ? "sold" : !l.is_active ? "hidden" : l.review_status === "pending" ? "pending" : "live";
    return {
      id: l.id, vin: l.vin, stock: l.stock_number,
      title: `${l.year} ${l.make} ${l.model}${l.trim_level ? ` ${l.trim_level}` : ""}`,
      price: Number(l.price), miles: l.miles, deal: l.deal_rating as DealRating | null, state, source: l.source,
      photo: [...(l.listing_photos ?? [])].sort((a, b) => a.position - b.position)[0]?.url ?? null,
      days: Math.max(0, Math.floor(msAgo(l.first_seen_at) / 86_400_000)),
      promotedUntil: l.promoted_until,
      impressions: Number(s?.impressions ?? 0), opens: Number(s?.detail_opens ?? 0), likes: Number(s?.likes ?? 0),
      passes: Number(s?.passes ?? 0), leads: Number(s?.leads ?? 0),
    };
  });
  return (
    <InventoryView
      rows={rows}
      feed={{
        url: feed?.url ?? null, enabled: feed?.enabled ?? false, lastRunAt: feed?.last_run_at ?? null, lastStatus: feed?.last_status ?? null,
        lastStats: (feed?.last_stats as Record<string, number>) ?? {}, lastError: feed?.last_error ?? null,
      }}
      promotionPrice={config.billing.promotion_price_usd}
      promotionDays={config.billing.promotion_days}
      promotionSharePct={Math.round(config.promotions.max_share * 100)}
      sampleCsv={SAMPLE_FEED_CSV}
    />
  );
}
