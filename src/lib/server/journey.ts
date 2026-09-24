import "server-only";

import type { BillOfSaleData } from "@/components/journey/bill-of-sale";
import { BODY_LABEL, type BodyStyle } from "../types";
import type { ServerSupabase } from "../supabase/server";

/** Bill-of-sale data for a private-sale interest (RLS: its buyer or seller only). */
export async function loadBillOfSale(supabase: ServerSupabase, interestId: string, names: { sellerFirstName?: string | null; buyerFirstName?: string | null }): Promise<BillOfSaleData | null> {
  const { data: interest } = await supabase.from("interests")
    .select("id, seller_user_id, dossier, listing:listings(year, make, model, trim_level, vin, miles, exterior_color, body_style)")
    .eq("id", interestId).maybeSingle();
  if (!interest?.seller_user_id || !interest.listing) return null;
  const l = interest.listing as unknown as { year: number; make: string; model: string; trim_level: string | null; vin: string; miles: number; exterior_color: string | null; body_style: BodyStyle };
  const { data: offer } = await supabase.from("offers").select("vehicle_price").eq("interest_id", interestId).eq("status", "picked").maybeSingle();
  return {
    year: l.year, make: l.make, model: l.model, trim: l.trim_level, vin: l.vin, miles: l.miles,
    color: l.exterior_color, body: BODY_LABEL[l.body_style] ?? l.body_style,
    price: offer ? Number(offer.vehicle_price) : null,
    sellerFirstName: names.sellerFirstName ?? null,
    buyerFirstName: names.buyerFirstName ?? (interest.dossier as { first_name?: string } | null)?.first_name ?? null,
  };
}
