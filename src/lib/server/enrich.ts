import "server-only";

import { featuresFromListingText } from "../inventory/normalize";
import { styleEmbedding } from "../inventory/style-embedding";
import type { AdminSupabase } from "../supabase/admin";
import type { BodyStyle } from "../types";

/**
 * Once per listing: fill feature gaps from the dealer description (regex
 * matcher; AI enrichment slots in here) and compute a style embedding for
 * visual taste (attribute-only until an image-embedding provider is chosen).
 */
export async function runEnrichment(admin: AdminSupabase, limit = 100) {
  const { data: pending } = await admin
    .from("listings")
    .select("id, make, body_style, fuel_type, exterior_color_family, trim_level, features, features_verified, description, length_in, listing_enrichment(listing_id), listing_embeddings(listing_id)")
    .eq("is_active", true)
    .limit(limit * 3);

  let enriched = 0;
  let embedded = 0;
  for (const l of (pending ?? []).filter((x) => !(x.listing_enrichment as unknown) || !(x.listing_embeddings as unknown)).slice(0, limit)) {
    const hasEnrichment = Boolean(l.listing_enrichment);
    const hasEmbedding = Boolean(l.listing_embeddings);
    if (!hasEnrichment) {
      const found = featuresFromListingText(l.description);
      await admin.from("listing_enrichment").upsert({
        listing_id: l.id, features: found, confidence: l.description ? 0.6 : 0, model: "regex-v1",
      });
      if (!l.features_verified) {
        const merged = [...new Set([...(l.features ?? []), ...found])].sort();
        if (merged.length !== (l.features ?? []).length) await admin.from("listings").update({ features: merged }).eq("id", l.id);
      }
      enriched++;
    }
    if (!hasEmbedding) {
      const emb = styleEmbedding({
        make: l.make, body_style: l.body_style as BodyStyle, fuel_type: l.fuel_type, exterior_color_family: l.exterior_color_family,
        trim_level: l.trim_level, features: l.features ?? [], length_in: l.length_in,
      });
      await admin.from("listing_embeddings").upsert({ listing_id: l.id, model: "attribute-style-v1", embedding: `[${emb.join(",")}]` });
      embedded++;
    }
  }
  return { enriched, embedded };
}
