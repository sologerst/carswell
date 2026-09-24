import type { Metadata } from "next";
import { TradeEstimator } from "@/components/journey/trade-estimator";
import { loadPrefs } from "@/lib/server/data";
import { requireOnboarded } from "@/lib/server/session";
import { createClient } from "@/lib/supabase/server";
import type { TradeIn } from "@/lib/types";

export const metadata: Metadata = { title: "Trade-in estimate" };

export default async function TradePage() {
  const profile = await requireOnboarded("/trade");
  const prefs = await loadPrefs(await createClient(), profile.id);
  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 pt-safe pb-10 lg:px-8">
      <header className="pt-6">
        <h1 className="text-2xl font-bold tracking-tight">What&apos;s my trade worth?</h1>
        <p className="text-muted">A quick range from local market data, so offers compare fairly.</p>
      </header>
      <TradeEstimator userId={profile.id} trade={(prefs.trade_in?.value as TradeIn | undefined) ?? null} />
    </main>
  );
}
