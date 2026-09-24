import "server-only";

import type { ServerSupabase } from "../supabase/server";

export const INTEREST_STATUS: Record<string, { label: string; tone: "default" | "accent" | "good" | "fair" | "bad" | "drive" }> = {
  sent: { label: "Sent to dealer", tone: "default" },
  offered: { label: "Offer in", tone: "accent" },
  matched: { label: "Matched", tone: "good" },
  purchased: { label: "Bought", tone: "good" },
  declined: { label: "Passed on offers", tone: "default" },
  expired: { label: "No reply yet", tone: "fair" },
  unavailable: { label: "Sold", tone: "bad" },
  withdrawn: { label: "Withdrawn", tone: "default" },
};

export interface LikedCar {
  interest_id: string;
  status: string;
  kind: string;
  created_at: string;
  lead_channel: string | null;
  listing: {
    id: string; year: number; make: string; model: string; trim_level: string | null; price: number; miles: number;
    is_active: boolean; photo: string | null; dealer_name: string | null; seller_type: string; source_url: string | null;
  };
}

export async function loadLikes(supabase: ServerSupabase, userId: string): Promise<LikedCar[]> {
  const { data } = await supabase
    .from("interests")
    .select("id, status, kind, created_at, listing:listings(id, year, make, model, trim_level, price, miles, is_active, seller_type, source_url, listing_photos(url, position)), dealership:dealerships(name, lead_channel)")
    .eq("user_id", userId)
    .neq("status", "withdrawn")
    .order("created_at", { ascending: false });
  return (data ?? []).filter((i) => i.listing).map((i) => {
    const l = i.listing as unknown as {
      id: string; year: number; make: string; model: string; trim_level: string | null; price: number; miles: number;
      is_active: boolean; seller_type: string; source_url: string | null; listing_photos: { url: string; position: number }[];
    };
    const d = i.dealership as unknown as { name: string; lead_channel: string } | null;
    return {
      interest_id: i.id,
      status: l.is_active ? i.status : i.status === "purchased" ? "purchased" : "unavailable",
      kind: i.kind,
      created_at: i.created_at,
      lead_channel: d?.lead_channel ?? null,
      listing: {
        id: l.id, year: l.year, make: l.make, model: l.model, trim_level: l.trim_level, price: Number(l.price), miles: l.miles,
        is_active: l.is_active, seller_type: l.seller_type, source_url: l.source_url, dealer_name: d?.name ?? null,
        photo: [...(l.listing_photos ?? [])].sort((a, b) => a.position - b.position)[0]?.url ?? null,
      },
    };
  });
}
