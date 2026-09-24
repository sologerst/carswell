import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, Sparkles } from "lucide-react";
import { Empty, Pill } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { miles, usd } from "@/lib/format";
import { INTEREST_STATUS, loadLikes } from "@/lib/server/buyer";
import { requireOnboarded } from "@/lib/server/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Likes" };

export default async function LikesPage() {
  const profile = await requireOnboarded("/likes");
  const supabase = await createClient();
  const likes = await loadLikes(supabase, profile.id);

  return (
    <main className="mx-auto max-w-6xl px-4 pt-safe lg:px-8">
      <header className="flex h-16 items-center justify-between lg:h-20">
        <h1 className="text-2xl font-bold tracking-tight">Likes</h1>
        <span className="text-sm text-muted">{likes.length} car{likes.length === 1 ? "" : "s"}</span>
      </header>
      {likes.length === 0 ? (
        <Empty title="No likes yet" body="Swipe right on cars you'd consider. Each like goes to the dealer, who can answer with an out-the-door price." action={<Button asChild><Link href="/deck">Go to the deck</Link></Button>} />
      ) : (
        <ul className="grid grid-cols-2 gap-3 pb-8 md:grid-cols-3 xl:grid-cols-4">
          {likes.map((c) => {
            const s = INTEREST_STATUS[c.status] ?? INTEREST_STATUS.sent;
            const sold = c.status === "unavailable";
            return (
              <li key={c.interest_id} className="overflow-hidden rounded-3xl border border-line bg-navy-900">
                <Link href={`/car/${c.listing.id}`} className="block">
                  <div className="relative aspect-[4/3] bg-navy-850">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {c.listing.photo && <img src={c.listing.photo} alt="" className={`size-full object-cover ${sold ? "opacity-40 grayscale" : ""}`} loading="lazy" />}
                    <span className="absolute left-2 top-2 flex gap-1">
                      <Pill tone={s.tone}>{s.label}</Pill>
                      {c.kind === "superlike" && <Pill tone="drive"><CalendarClock className="size-3" /></Pill>}
                    </span>
                  </div>
                  <div className="p-3">
                    <p className="font-bold">{usd(c.listing.price)}</p>
                    <p className="truncate text-sm">{c.listing.year} {c.listing.make} {c.listing.model}</p>
                    <p className="truncate text-xs text-muted">{miles(c.listing.miles)} · {c.listing.seller_type === "private" ? "Private seller" : c.listing.dealer_name}</p>
                  </div>
                </Link>
                {sold ? (
                  <Link href={`/deck?anchor=${c.listing.id}`} className="tap mx-3 mb-3 flex items-center justify-center gap-1 rounded-full bg-navy-800 text-xs font-bold hover:bg-navy-700">
                    <Sparkles className="size-3.5" /> See similar
                  </Link>
                ) : c.lead_channel === "none" && c.status === "sent" ? (
                  <p className="px-3 pb-3 text-[11px] text-subtle">This dealer isn&apos;t on CarSwipe yet; we saved your interest and will reach out.</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
