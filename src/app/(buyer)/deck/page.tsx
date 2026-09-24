import type { Metadata } from "next";
import { DeckView } from "@/components/deck/deck-view";
import { buyerContext, getDeck } from "@/lib/server/deck";
import { requireOnboarded } from "@/lib/server/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Deck" };

export default async function DeckPage({ searchParams }: PageProps<"/deck">) {
  const profile = await requireOnboarded("/deck");
  const { anchor } = await searchParams;
  const anchorId = typeof anchor === "string" && /^[0-9a-f-]{36}$/i.test(anchor) ? anchor : null;
  const supabase = await createClient();
  const [deck, ctx] = await Promise.all([getDeck(supabase, profile, { anchor: anchorId }), buyerContext(supabase, profile)]);
  let anchorTitle: string | null = null;
  if (anchorId) {
    const { data } = await supabase.from("listings").select("year, make, model").eq("id", anchorId).maybeSingle();
    if (data) anchorTitle = `${data.year} ${data.make} ${data.model}`;
  }
  return (
    <DeckView
      initial={deck}
      origin={{ lat: ctx.origin.lat, lng: ctx.origin.lng, label: `${ctx.origin.city} ${ctx.origin.zip}` }}
      anchorTitle={anchorTitle}
    />
  );
}
