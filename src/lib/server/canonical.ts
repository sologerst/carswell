import "server-only";

import { pickCanonical, type DedupeRow } from "../inventory/dedupe";
import type { AdminSupabase } from "../supabase/admin";

/**
 * Re-pick one canonical card per VIN for the given VINs (dealer feed >
 * private > MarketCheck dealer > MarketCheck private). Demotes first so the
 * partial unique index never sees two canonical rows.
 */
export async function recomputeCanonicalForVins(admin: AdminSupabase, vins: string[]) {
  let changed = 0;
  for (let i = 0; i < vins.length; i += 200) {
    const chunk = vins.slice(i, i + 200);
    const { data } = await admin.from("listings")
      .select("id, vin, source, seller_type, last_seen_at, is_canonical")
      .in("vin", chunk).eq("is_active", true).eq("review_status", "approved");
    const rows = (data ?? []) as (DedupeRow & { is_canonical: boolean })[];
    const winners = new Set(pickCanonical(rows).values());
    const demote = rows.filter((r) => r.is_canonical && !winners.has(r.id)).map((r) => r.id);
    const promote = rows.filter((r) => !r.is_canonical && winners.has(r.id)).map((r) => r.id);
    if (demote.length) await admin.from("listings").update({ is_canonical: false }).in("id", demote);
    if (promote.length) await admin.from("listings").update({ is_canonical: true }).in("id", promote);
    changed += demote.length + promote.length;
  }
  return changed;
}
