import type { Metadata } from "next";
import { BarList, StatTile } from "@/components/charts/bar-list";
import { Button } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/primitives";
import { DEAL_LABEL } from "@/lib/deal";
import { unmetLabel, type UnmetDemandInsight } from "@/lib/server/insights";
import { createAdminClient } from "@/lib/supabase/admin";
import { BODY_LABEL, type BodyStyle, type DealRating } from "@/lib/types";
import { runJob } from "../actions";

export const metadata: Metadata = { title: "Market" };
export const dynamic = "force-dynamic";

const DEAL_ORDER = ["great", "good", "fair", "high", "overpriced", "unrated"];

export default async function MarketPage() {
  const admin = createAdminClient();
  const { data: latest } = await admin.from("demand_insights").select("period_end").is("dealership_id", null).order("period_end", { ascending: false }).limit(1).maybeSingle();
  const { data: rows } = latest
    ? await admin.from("demand_insights").select("market_id, kind, key, payload").is("dealership_id", null).eq("period_end", latest.period_end)
    : { data: [] };
  const [{ count: dealerRows }, { count: activeBuyers }] = await Promise.all([
    latest ? admin.from("demand_insights").select("id", { count: "exact", head: true }).not("dealership_id", "is", null).eq("period_end", latest.period_end) : Promise.resolve({ count: 0 }),
    admin.from("profiles").select("id", { count: "exact", head: true }).not("budget_max_price", "is", null),
  ]);
  const of = <T,>(kind: string) => (rows ?? []).filter((r) => r.kind === kind).map((r) => r.payload as unknown as T);
  const unmet = of<UnmetDemandInsight & { supply: number }>("market_unmet").map((u) => ({ ...u, ratio: u.buyers / Math.max(1, u.supply) })).sort((a, b) => b.ratio - a.ratio);
  const models = of<{ make: string; model: string; buyers: number; like_rate: number; supply: number }>("market_models").sort((a, b) => b.buyers - a.buyers);
  const deals = of<{ deal_rating: string; like_rate: number; buyers: number; swipes: number }>("market_deals").sort((a, b) => DEAL_ORDER.indexOf(a.deal_rating) - DEAL_ORDER.indexOf(b.deal_rating));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Market demand</h1>
          <p className="text-sm text-muted">Nashville, last 30 days{latest ? `, computed ${new Date(latest.period_end).toLocaleDateString("en-US")}` : " (not computed yet)"}. k-anonymous aggregates only.</p>
        </div>
        <form action={runJob}><input type="hidden" name="job" value="insights" /><Button size="sm" variant="secondary" type="submit">Recompute now</Button></form>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Buyers with a budget on file" value={(activeBuyers ?? 0).toLocaleString("en-US")} />
        <StatTile label="Dealer insight rows" value={(dealerRows ?? 0).toLocaleString("en-US")} />
        <StatTile label="Demand pockets" value={String(unmet.length)} />
        <StatTile label="Models with 5+ likers" value={String(models.length)} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle>Undersupplied: buyers per matching car</SectionTitle>
          <BarList title="Buyers per matching listing" valueHeader="Buyers per car"
            rows={unmet.slice(0, 12).map((u) => ({
              key: `${u.body_style}:${u.max_price}`,
              label: unmetLabel(BODY_LABEL[u.body_style as BodyStyle] ?? u.body_style, u.max_price),
              value: u.ratio, valueLabel: u.ratio.toFixed(1),
              details: [["Buyers", String(u.buyers)], ["Matching cars", String(u.supply)]],
            }))} />
        </Card>
        <Card className="p-5">
          <SectionTitle>Most-liked models</SectionTitle>
          <BarList title="Distinct buyers who liked each model" valueHeader="Buyers"
            rows={models.slice(0, 12).map((m) => ({
              key: `${m.make} ${m.model}`, label: `${m.make} ${m.model}`, value: m.buyers, valueLabel: String(m.buyers),
              details: [["Like rate", `${Math.round(m.like_rate * 100)}%`], ["Cars listed", String(m.supply)]],
            }))} />
        </Card>
        <Card className="p-5 lg:col-span-2">
          <SectionTitle>Price sensitivity: like rate by deal rating</SectionTitle>
          <BarList title="Like rate by deal rating" valueHeader="Like rate" max={1}
            rows={deals.map((d) => ({
              key: d.deal_rating,
              label: d.deal_rating === "unrated" ? "Not rated" : DEAL_LABEL[d.deal_rating as DealRating],
              value: d.like_rate, valueLabel: `${Math.round(d.like_rate * 100)}%`,
              details: [["Swipes", d.swipes.toLocaleString("en-US")], ["Buyers", d.buyers.toLocaleString("en-US")]],
            }))} />
        </Card>
      </div>
    </div>
  );
}
