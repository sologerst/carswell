import type { Metadata } from "next";
import { BarList, StatTile } from "@/components/charts/bar-list";
import { BillingButton } from "@/components/dealer/billing-button";
import { Card, SectionTitle } from "@/components/ui/primitives";
import { usd } from "@/lib/format";
import { entitlements } from "@/lib/server/billing";
import { loadConfig } from "@/lib/server/data";
import { passSentence, unmetLabel, type ListingPassInsight, type UnmetDemandInsight } from "@/lib/server/insights";
import { requireDealer } from "@/lib/server/session";
import { createClient } from "@/lib/supabase/server";
import { BODY_LABEL, type BodyStyle } from "@/lib/types";

export const metadata: Metadata = { title: "Demand insights" };

export default async function InsightsPage() {
  const { membership } = await requireDealer();
  const supabase = await createClient();
  const d = membership.dealership;
  const [config, ent] = await Promise.all([loadConfig(supabase), entitlements(supabase, d)]);

  if (!ent.insights) {
    return (
      <Card className="mx-auto max-w-2xl space-y-4 p-6">
        <h1 className="text-2xl font-bold">Demand insights</h1>
        <p className="text-muted">See why buyers pass on specific cars, the prices they tolerate for similar cars, and local demand you aren&apos;t stocking. Updated nightly from anonymous, aggregated swipes (never fewer than {config.insights.k_anonymity} buyers per number).</p>
        <p className="text-2xl font-bold">{usd(config.billing.insights_monthly_usd)}<span className="text-base font-normal text-muted"> / month</span></p>
        {membership.role === "owner" ? <BillingButton body={{ action: "checkout", product: "insights" }}>Subscribe</BillingButton> : <p className="text-sm text-muted">Ask an owner to subscribe.</p>}
      </Card>
    );
  }

  const { data: latest } = await supabase.from("demand_insights").select("period_end").eq("dealership_id", d.id).order("period_end", { ascending: false }).limit(1).maybeSingle();
  const [{ data: rows }, { data: stats }] = await Promise.all([
    latest ? supabase.from("demand_insights").select("kind, key, payload").eq("dealership_id", d.id).eq("period_end", latest.period_end) : Promise.resolve({ data: [] }),
    supabase.rpc("dealer_inventory_stats", { p_dealership_id: d.id, p_days: 30 }),
  ]);
  const passes = (rows ?? []).filter((r) => r.kind === "listing_pass").map((r) => r.payload as unknown as ListingPassInsight).sort((a, b) => b.passes - a.passes);
  const unmet = (rows ?? []).filter((r) => r.kind === "unmet_demand").map((r) => r.payload as unknown as UnmetDemandInsight).sort((a, b) => b.buyers - a.buyers);
  const t = (stats ?? []).reduce((a, s) => ({ seen: a.seen + Number(s.impressions), likes: a.likes + Number(s.likes), passes: a.passes + Number(s.passes), leads: a.leads + Number(s.leads) }), { seen: 0, likes: 0, passes: 0, leads: 0 });
  const rate = t.likes + t.passes ? Math.round((t.likes / (t.likes + t.passes)) * 100) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Demand insights</h1>
        <p className="text-sm text-muted">Last 30 days{latest ? `, updated ${new Date(latest.period_end).toLocaleDateString("en-US")}` : ""}. Aggregated and anonymous: every number covers at least {config.insights.k_anonymity} buyers.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Times your cars were seen" value={t.seen.toLocaleString("en-US")} />
        <StatTile label="Likes" value={t.likes.toLocaleString("en-US")} context={`${t.passes.toLocaleString("en-US")} passes`} />
        <StatTile label="Like rate" value={rate === null ? "–" : `${rate}%`} />
        <StatTile label="Demand gaps nearby" value={String(unmet.length)} context="Body style and price combos you don't stock" />
      </div>

      <Card className="p-5">
        <SectionTitle>Cars buyers pass on most</SectionTitle>
        <BarList
          title="Passes per car, last 30 days"
          valueHeader="Passes"
          rows={passes.slice(0, 10).map((p) => ({
            key: p.listing_id,
            label: p.title,
            sublabel: usd(p.price),
            value: p.passes,
            valueLabel: `${p.passes} passes`,
            details: [
              ["Like rate", p.like_rate === null ? "–" : `${Math.round(p.like_rate * 100)}%`],
              ["Same model elsewhere", p.peer_like_rate === null ? "–" : `${Math.round(p.peer_like_rate * 100)}%`],
              ["Liked similar at", p.tolerance_price === null ? "–" : usd(p.tolerance_price)],
            ],
          }))}
        />
        {passes.length > 0 && (
          <ul className="mt-5 space-y-2 border-t border-line pt-4 text-sm">
            {passes.slice(0, 5).map((p) => <li key={p.listing_id}><span className="font-bold">{p.title}.</span> <span className="text-muted">{passSentence(p)}</span></li>)}
          </ul>
        )}
      </Card>

      <Card className="p-5">
        <SectionTitle>Local demand you aren&apos;t stocking</SectionTitle>
        <p className="mb-4 text-sm text-muted">Active buyers within 40 miles, by what they want and can spend, where you have no matching car.</p>
        <BarList
          title="Buyers wanting cars you don't have"
          valueHeader="Buyers"
          rows={unmet.slice(0, 10).map((u) => ({
            key: `${u.body_style}:${u.max_price}`,
            label: unmetLabel(BODY_LABEL[u.body_style as BodyStyle] ?? u.body_style, u.max_price),
            value: u.buyers,
            valueLabel: `${u.buyers} buyers`,
          }))}
        />
      </Card>
    </div>
  );
}
