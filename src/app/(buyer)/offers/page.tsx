import type { Metadata } from "next";
import Link from "next/link";
import { OffersView, type OfferGroup } from "@/components/offers/offers-view";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/primitives";
import { aprFor, budgetFromPrefs, monthlyPayment } from "@/lib/money";
import { loadConfig, loadPrefs } from "@/lib/server/data";
import { requireOnboarded } from "@/lib/server/session";
import { createClient } from "@/lib/supabase/server";
import type { Condition, TradeIn } from "@/lib/types";

export const metadata: Metadata = { title: "Offers" };

const firstId = (x: unknown): string | null => {
  const v = Array.isArray(x) ? x[0] : x;
  return (v as { id?: string } | null)?.id ?? null;
};

export default async function OffersPage() {
  const profile = await requireOnboarded("/offers");
  const supabase = await createClient();
  const [config, prefs, { data }] = await Promise.all([
    loadConfig(supabase),
    loadPrefs(supabase, profile.id),
    supabase
      .from("interests")
      .select("id, status, kind, created_at, sla_expires_at, buyer_notes, listing:listings(id, year, make, model, trim_level, price, condition, listing_photos(url, position)), dealership:dealerships(name, lead_channel, rating, response_time_minutes), offers(*), conversations(id)")
      .eq("user_id", profile.id)
      .in("status", ["sent", "offered", "matched", "purchased", "declined", "expired"])
      .order("updated_at", { ascending: false }),
  ]);
  const budget = budgetFromPrefs(prefs, config.finance);

  const groups: OfferGroup[] = (data ?? []).filter((i) => i.listing).map((i) => {
    const l = i.listing as unknown as { id: string; year: number; make: string; model: string; trim_level: string | null; price: number; condition: Condition; listing_photos: { url: string; position: number }[] };
    const d = i.dealership as unknown as { name: string; lead_channel: string; rating: number | null; response_time_minutes: number | null } | null;
    const apr = aprFor(l.condition, budget.credit, config.finance);
    const offers = ((i.offers ?? []) as unknown as {
      id: string; status: string; otd_total: number; vehicle_price: number; doc_fee: number; dealer_fees: number; tax: number;
      title_fees: number; trade_credit: number; notes: string | null; expires_at: string; created_at: string; source: string; apr: number | null; term_months: number | null;
    }[]).map((o) => ({
      ...o,
      otd_total: Number(o.otd_total), vehicle_price: Number(o.vehicle_price), doc_fee: Number(o.doc_fee), dealer_fees: Number(o.dealer_fees),
      tax: Number(o.tax), title_fees: Number(o.title_fees), trade_credit: Number(o.trade_credit),
      monthly: budget.mode === "cash" ? null : Math.round(monthlyPayment(Math.max(0, Number(o.otd_total) - budget.down), apr, budget.termMonths)),
    })).sort((a, b) => a.otd_total - b.otd_total);
    return {
      interestId: i.id,
      status: i.status,
      kind: i.kind,
      slaExpiresAt: i.sla_expires_at,
      notes: (i.buyer_notes as { body: string; at: string }[] | null) ?? [],
      conversationId: firstId(i.conversations),
      listing: { id: l.id, title: `${l.year} ${l.make} ${l.model}${l.trim_level ? ` ${l.trim_level}` : ""}`, price: Number(l.price), photo: [...(l.listing_photos ?? [])].sort((a, b) => a.position - b.position)[0]?.url ?? null },
      dealer: d ? { name: d.name, leadChannel: d.lead_channel, rating: d.rating, responseMinutes: d.response_time_minutes } : null,
      offers,
    };
  });

  const trade = prefs.trade_in?.value as TradeIn | undefined;
  const assumptions = budget.mode === "cash" ? "Cash purchase." : `Monthly estimates: ${budget.termMonths} mo, $${budget.down.toLocaleString("en-US")} down, ${budget.credit} credit. Not a credit offer.`;

  return (
    <main className="mx-auto max-w-5xl px-4 pt-safe pb-10 lg:px-8">
      <header className="flex h-16 items-center lg:h-20">
        <h1 className="text-2xl font-bold tracking-tight">Offers</h1>
      </header>
      {groups.length === 0 ? (
        <Empty title="No offers yet" body="Like a car and its dealer can answer with a real out-the-door price. You'll compare offers side by side here." action={<Button asChild><Link href="/deck">Find cars</Link></Button>} />
      ) : (
        <OffersView groups={groups} assumptions={assumptions} askTradeEstimate={Boolean(trade?.has && !trade.value)} />
      )}
    </main>
  );
}
