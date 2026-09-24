import "server-only";

import type { ChatMessage } from "@/components/chat/chat-view";
import type { ServerSupabase } from "../supabase/server";

/** Conversation + messages; RLS returns nothing unless the caller is a participant. */
export async function loadConversation(supabase: ServerSupabase, id: string) {
  const { data: conv } = await supabase
    .from("conversations")
    .select("id, interest_id, buyer_id, dealership_id, buyer_phone_shared_at, dealership:dealerships(name), interest:interests(listing:listings(year, make, model, trim_level, listing_photos(url, position)), dossier)")
    .eq("id", id)
    .maybeSingle();
  if (!conv) return null;
  const { data: messages } = await supabase
    .from("messages")
    .select("id, sender_id, sender_role, kind, body, meta, flagged, created_at")
    .eq("conversation_id", id)
    .order("created_at")
    .limit(500);
  const interest = conv.interest as unknown as { dossier: { first_name?: string }; listing: { year: number; make: string; model: string; trim_level: string | null; listing_photos: { url: string; position: number }[] } };
  const l = interest.listing;
  return {
    id: conv.id,
    interestId: conv.interest_id,
    buyerId: conv.buyer_id,
    dealershipId: conv.dealership_id,
    dealerName: (conv.dealership as unknown as { name: string } | null)?.name ?? "Dealer",
    buyerName: interest.dossier?.first_name ?? "Buyer",
    phoneShared: Boolean(conv.buyer_phone_shared_at),
    title: `${l.year} ${l.make} ${l.model}${l.trim_level ? ` ${l.trim_level}` : ""}`,
    photo: [...(l.listing_photos ?? [])].sort((a, b) => a.position - b.position)[0]?.url ?? null,
    messages: (messages ?? []) as unknown as ChatMessage[],
  };
}
