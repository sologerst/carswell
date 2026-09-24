import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CarDetail, type DetailCard } from "@/components/car/car-detail";
import { Pill } from "@/components/ui/primitives";
import { INTEREST_STATUS } from "@/lib/server/buyer";
import { getCards } from "@/lib/server/deck";
import { requireOnboarded } from "@/lib/server/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Car" };

export default async function CarPage({ params }: PageProps<"/car/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const profile = await requireOnboarded(`/car/${id}`);
  const supabase = await createClient();
  const [{ ctx, cards }, { data: interest }] = await Promise.all([
    getCards(supabase, profile, [id]),
    supabase.from("interests").select("id, status").eq("user_id", profile.id).eq("listing_id", id).maybeSingle(),
  ]);
  const card = cards[0];
  if (!card || !ctx) notFound();
  const status = interest ? INTEREST_STATUS[card.listing.is_active ? interest.status : "unavailable"] : null;

  return (
    <main className="mx-auto max-w-3xl px-4 pt-safe pb-10 lg:px-8">
      <div className="flex h-16 items-center">
        <Link href="/likes" className="tap -ml-2 inline-flex items-center gap-1 rounded-full px-2 text-sm font-bold text-muted hover:text-ink">
          <ArrowLeft className="size-4" /> Likes
        </Link>
      </div>
      <CarDetail
        card={card as DetailCard}
        origin={{ lat: ctx.origin.lat, lng: ctx.origin.lng, label: `${ctx.origin.city} ${ctx.origin.zip}` }}
        statusSlot={status ? <div className="mt-3 flex items-center gap-2"><Pill tone={status.tone}>{status.label}</Pill>{interest?.status === "offered" && <Link href={`/offers#${interest.id}`} className="text-sm font-bold text-accent-soft">See offers</Link>}</div> : null}
      />
    </main>
  );
}
