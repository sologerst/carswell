import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Eye, Heart, MousePointerClick, X } from "lucide-react";
import { ListingManager } from "@/components/sell/listing-manager";
import { Button } from "@/components/ui/button";
import { Card, DealBadge, Pill, SectionTitle } from "@/components/ui/primitives";
import type { RiskFlag } from "@/lib/safety/listing-risk";
import { daysBackIso, usd } from "@/lib/format";
import { requireProfile } from "@/lib/server/session";
import { createClient } from "@/lib/supabase/server";
import type { DealRating } from "@/lib/types";

export const metadata: Metadata = { title: "Your listing" };

export default async function SellerListingPage({ params }: PageProps<"/sell/listings/[id]">) {
  const { id } = await params;
  const profile = await requireProfile(`/sell/listings/${id}`);
  const supabase = await createClient();
  const { data: l } = await supabase.from("listings")
    .select("*, listing_photos(url, position)")
    .eq("id", id).eq("private_seller_id", profile.id).maybeSingle();
  if (!l) notFound();
  const since = daysBackIso(30).slice(0, 10);
  const [{ data: stats }, { count: buyers }] = await Promise.all([
    supabase.from("listing_stats_daily").select("impressions, detail_opens, likes, superlikes, passes").eq("listing_id", id).gte("day", since),
    supabase.from("interests").select("id", { count: "exact", head: true }).eq("listing_id", id),
  ]);
  const t = (stats ?? []).reduce((a, s) => ({
    impressions: a.impressions + s.impressions, opens: a.opens + s.detail_opens,
    likes: a.likes + s.likes + s.superlikes, passes: a.passes + s.passes,
  }), { impressions: 0, opens: 0, likes: 0, passes: 0 });
  const state = l.sold_at ? "sold" : l.review_status === "approved" ? (l.is_active ? "live" : "paused") : l.review_status === "pending" ? "pending" : "rejected";
  const flags = ((l.moderation as { flags?: RiskFlag[] } | null)?.flags ?? []);
  const photos = [...(l.listing_photos ?? [])].sort((a, b) => a.position - b.position);

  return (
    <div className="space-y-6">
      <Link href="/sell" className="tap -ml-2 inline-flex items-center gap-1 rounded-full px-2 text-sm font-bold text-muted hover:text-ink"><ArrowLeft className="size-4" /> My cars</Link>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <div className="flex snap-x gap-1 overflow-x-auto scrollbar-none">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {photos.map((p) => <img key={p.url} src={p.url} alt="" className="h-56 w-auto shrink-0 snap-start object-cover" />)}
            </div>
            <div className="p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={state === "live" ? "good" : state === "pending" ? "fair" : state === "rejected" ? "bad" : "default"}>{state === "pending" ? "In review" : state === "rejected" ? "Not published" : state}</Pill>
                <DealBadge rating={l.deal_rating as DealRating | null} />
              </div>
              <h1 className="mt-2 text-2xl font-bold">{l.year} {l.make} {l.model}{l.trim_level ? ` ${l.trim_level}` : ""}</h1>
              <p className="text-muted">{usd(Number(l.price))} · {l.miles.toLocaleString("en-US")} miles · VIN {l.vin}</p>
              {l.expected_price && <p className="mt-1 text-sm text-subtle">Similar cars list around {usd(Number(l.expected_price))}.</p>}
            </div>
          </Card>

          {state === "live" || state === "paused" || state === "sold" ? (
            <Card className="p-5">
              <SectionTitle>Last 30 days</SectionTitle>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat icon={<Eye className="size-4" />} label="Seen in decks" value={t.impressions} />
                <Stat icon={<MousePointerClick className="size-4" />} label="Opened" value={t.opens} />
                <Stat icon={<Heart className="size-4" />} label="Liked" value={t.likes} />
                <Stat icon={<X className="size-4" />} label="Passed" value={t.passes} />
              </div>
              {(buyers ?? 0) > 0 && <Button className="mt-4" asChild><Link href="/sell/leads">See {buyers} interested buyer{buyers === 1 ? "" : "s"}</Link></Button>}
            </Card>
          ) : null}

          {flags.length > 0 && state !== "live" && (
            <Card className="p-5">
              <SectionTitle>{state === "pending" ? "Why it's in review" : "Why it wasn't published"}</SectionTitle>
              <ul className="space-y-2 text-sm">{flags.map((f) => <li key={f.code} className="rounded-2xl bg-navy-850 px-4 py-3">{f.detail}</li>)}</ul>
            </Card>
          )}

          <Card className="p-5">
            <SectionTitle>Description</SectionTitle>
            <p className="whitespace-pre-wrap text-sm text-muted">{l.description}</p>
          </Card>
        </div>
        <ListingManager id={l.id} price={Number(l.price)} description={l.description ?? ""} expected={l.expected_price === null ? null : Number(l.expected_price)} state={state as "live"} />
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-navy-850 p-3">
      <p className="flex items-center gap-1.5 text-xs font-bold text-subtle">{icon} {label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}
