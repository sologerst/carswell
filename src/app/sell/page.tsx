import type { Metadata } from "next";
import Link from "next/link";
import { Plus, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Empty, Pill, SectionTitle } from "@/components/ui/primitives";
import { msAgo, usd } from "@/lib/format";
import { loadConfig } from "@/lib/server/data";
import { requireProfile } from "@/lib/server/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Sell your car" };

const STATUS: Record<string, { text: string; tone: "good" | "fair" | "bad" | "default" | "accent" }> = {
  live: { text: "Live", tone: "good" },
  draft: { text: "Draft", tone: "default" },
  pending: { text: "In review", tone: "fair" },
  rejected: { text: "Not published", tone: "bad" },
  removed: { text: "Removed", tone: "default" },
  sold: { text: "Sold", tone: "accent" },
  paused: { text: "Paused", tone: "default" },
};

export default async function SellHome() {
  const profile = await requireProfile("/sell");
  const supabase = await createClient();
  const config = await loadConfig(supabase);
  const { data: listings } = await supabase.from("listings")
    .select("id, year, make, model, trim_level, price, miles, review_status, is_active, sold_at, published_at, listing_photos(url, position), interests(count)")
    .eq("private_seller_id", profile.id).eq("source", "private").neq("review_status", "removed")
    .order("created_at", { ascending: false });
  const listedThisYear = new Set((listings ?? []).filter((l) => l.published_at && msAgo(l.published_at) < 365 * 86_400_000).map((l) => l.id)).size;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sell your car</h1>
          <p className="text-muted">List in minutes. Buyers who match your car like it, you reply with a price, and you chat in the app. No fees for private sellers.</p>
        </div>
        <Button asChild size="lg"><Link href="/sell/new"><Plus /> List a car</Link></Button>
      </div>

      {(listings ?? []).length === 0 ? (
        <Card><Empty title="No cars listed yet" body="Scan your VIN, add photos and let AI draft the listing." action={<Button asChild><Link href="/sell/new">Start</Link></Button>} /></Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {(listings ?? []).map((l) => {
            const state = l.sold_at ? "sold" : l.review_status === "approved" ? (l.is_active ? "live" : "paused") : l.review_status;
            const photo = [...(l.listing_photos ?? [])].sort((a, b) => a.position - b.position)[0]?.url;
            const likes = (l.interests as unknown as { count: number }[])[0]?.count ?? 0;
            return (
              <li key={l.id}>
                <Link href={l.review_status === "draft" ? `/sell/new?draft=${l.id}` : `/sell/listings/${l.id}`} className="flex gap-4 rounded-3xl border border-line bg-navy-900 p-4 hover:border-navy-500">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {photo ? <img src={photo} alt="" className="h-20 w-28 rounded-2xl object-cover" /> : <div className="h-20 w-28 rounded-2xl bg-navy-800" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2"><Pill tone={STATUS[state]?.tone ?? "default"}>{STATUS[state]?.text ?? state}</Pill>{likes > 0 && <span className="text-xs font-bold text-accent-soft">{likes} buyer{likes === 1 ? "" : "s"}</span>}</div>
                    <p className="mt-1 truncate font-bold">{l.year} {l.make} {l.model}{l.trim_level ? ` ${l.trim_level}` : ""}</p>
                    <p className="text-sm text-muted">{usd(Number(l.price))} · {l.miles.toLocaleString("en-US")} mi</p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <Card className="grid gap-4 p-5 md:grid-cols-3">
        <div className="md:col-span-2">
          <SectionTitle>How private selling works</SectionTitle>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
            <li>Verify your phone and publish. Every listing is screened for known scam patterns.</li>
            <li>Buyers who like your car appear under Buyers. Reply with a price within 72 hours.</li>
            <li>When a buyer accepts, chat opens. Meet somewhere public, let them inspect it, and use the bill of sale.</li>
          </ol>
        </div>
        <div className="rounded-2xl bg-navy-850 p-4 text-sm">
          <p className="flex items-center gap-2 font-bold"><ShieldCheck className="size-4 text-deal-good" /> Listing limit</p>
          <p className="mt-1 text-muted">{listedThisYear} of {config.private_sales.max_listings_per_year} this year. Selling more cars than that needs a dealer license in Tennessee.</p>
        </div>
      </Card>
    </div>
  );
}
