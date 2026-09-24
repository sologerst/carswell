"use client";

import { AlertTriangle, Check, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/primitives";
import type { CarBrief } from "@/lib/brief/template";

interface BriefResponse {
  brief: CarBrief;
  cached: boolean;
  disclaimer: string;
}

const cache = new Map<string, BriefResponse>();

/** AI Car Brief: why it fits you, what to watch out for, and cost to own. */
export function BriefPanel({ listingId, onLoaded }: { listingId: string; onLoaded?: () => void }) {
  const [data, setData] = useState<BriefResponse | null>(cache.get(listingId) ?? null);
  const [error, setError] = useState<string | null>(null);

  // Parents key this component by listing id, so state starts fresh per car.
  useEffect(() => {
    if (cache.has(listingId)) return;
    let alive = true;
    fetch(`/api/brief/${listingId}`)
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? "Couldn't load the brief.");
        return body as BriefResponse;
      })
      .then((b) => {
        cache.set(listingId, b);
        if (alive) {
          setData(b);
          onLoaded?.();
        }
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [listingId, onLoaded]);

  if (error) return <p className="rounded-2xl bg-navy-850 p-4 text-sm text-muted">{error}</p>;
  if (!data) {
    return (
      <div className="space-y-3 rounded-3xl bg-navy-850 p-5" aria-busy="true" aria-label="Loading the car brief">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }
  const b = data.brief;
  return (
    <section className="rounded-3xl bg-gradient-to-br from-navy-800 to-navy-850 p-5" aria-label="Car brief">
      <div className="mb-4 flex items-center gap-2 text-sm font-bold text-accent-soft">
        <Sparkles className="size-4" /> Car Brief {b.generatedBy === "ai" ? <span className="text-xs font-normal text-subtle">· AI-written</span> : <span className="text-xs font-normal text-subtle">· from listing data</span>}
      </div>
      <h3 className="mb-2 text-sm font-bold">Why it fits you</h3>
      <ul className="space-y-2">
        {b.fits.map((c) => (
          <li key={c.text} className="flex gap-2 text-[15px]">
            <Check className="mt-0.5 size-4 shrink-0 text-deal-good" />
            <span>{c.text}</span>
          </li>
        ))}
      </ul>
      {b.watchOuts.length > 0 && (
        <>
          <h3 className="mt-5 mb-2 text-sm font-bold">Watch out for</h3>
          <ul className="space-y-2">
            {b.watchOuts.map((c) => (
              <li key={c.text} className="flex gap-2 text-[15px]">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-deal-fair" />
                <span>{c.text}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-5 rounded-2xl bg-black/20 px-4 py-3 text-sm">
        {b.costLine}
        <span className="mt-1 block text-xs text-subtle">
          Payment {b.costToOwn.payment ? `$${b.costToOwn.payment}` : "n/a"} · insurance ${b.costToOwn.insurance} · fuel ${b.costToOwn.fuel} · upkeep ${b.costToOwn.upkeep}
        </span>
      </p>
      <p className="mt-3 text-xs text-subtle">{data.disclaimer}</p>
    </section>
  );
}
