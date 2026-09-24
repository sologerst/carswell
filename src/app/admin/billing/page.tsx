import type { Metadata } from "next";
import { StatTile } from "@/components/charts/bar-list";
import { Card, Pill, SectionTitle } from "@/components/ui/primitives";
import { features } from "@/lib/env";
import { relativeTime, usd } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Billing" };
export const dynamic = "force-dynamic";

export default async function AdminBilling() {
  const admin = createAdminClient();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const [{ data: charges }, { data: subs }, { data: events }, { data: dealers }] = await Promise.all([
    admin.from("lead_charges").select("dealership_id, amount_usd, status, created_at").gte("created_at", monthStart),
    admin.from("subscriptions").select("dealership_id, product, status, current_period_end"),
    admin.from("stripe_events").select("id, type, status, error, received_at").order("received_at", { ascending: false }).limit(20),
    admin.from("dealerships").select("id, name, billing_exempt"),
  ]);
  const name = new Map((dealers ?? []).map((d) => [d.id, d.name]));
  const by = new Map<string, { n: number; usd: number; unbilled: number }>();
  for (const c of charges ?? []) {
    const cur = by.get(c.dealership_id) ?? { n: 0, usd: 0, unbilled: 0 };
    cur.n++;
    if (c.status !== "waived") cur.usd += Number(c.amount_usd);
    if (c.status === "pending") cur.unbilled++;
    by.set(c.dealership_id, cur);
  }
  const total = [...by.values()].reduce((s, v) => s + v.usd, 0);
  const paying = new Set((subs ?? []).filter((s) => s.product === "leads" && ["active", "trialing"].includes(s.status)).map((s) => s.dealership_id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Billing</h1>
        <p className="text-sm text-muted">Matched-lead charges this month and Stripe status. {features.stripe ? "Stripe is connected." : "Stripe isn't configured: dealers are on the dev entitlement and charges stay unbilled."}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Matched leads this month" value={String((charges ?? []).length)} />
        <StatTile label="Lead revenue this month" value={usd(total)} />
        <StatTile label="Paying dealers" value={String(paying.size)} context="Kill criterion: 3 by day 90" />
        <StatTile label="Insights subscribers" value={String((subs ?? []).filter((s) => s.product === "insights" && s.status === "active").length)} />
      </div>
      <Card className="p-5">
        <SectionTitle>By dealer</SectionTitle>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-subtle"><tr><th className="py-2">Dealer</th><th className="text-right">Matched</th><th className="text-right">Amount</th><th className="text-right">Unbilled</th><th className="text-right">Plan</th></tr></thead>
          <tbody className="divide-y divide-line tabular-nums">
            {[...by.entries()].sort((a, b) => b[1].usd - a[1].usd).map(([id, v]) => (
              <tr key={id}><td className="py-2">{name.get(id) ?? id}</td><td className="text-right">{v.n}</td><td className="text-right">{usd(v.usd)}</td><td className="text-right">{v.unbilled}</td>
                <td className="text-right"><Pill tone={paying.has(id) ? "good" : (dealers ?? []).find((d) => d.id === id)?.billing_exempt ? "default" : "fair"}>{paying.has(id) ? "Stripe" : (dealers ?? []).find((d) => d.id === id)?.billing_exempt ? "Manual" : "None"}</Pill></td></tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card className="p-5">
        <SectionTitle>Recent Stripe events</SectionTitle>
        {(events ?? []).length === 0 ? <p className="text-sm text-muted">None yet.</p> : (
          <ul className="divide-y divide-line text-sm">
            {(events ?? []).map((e) => <li key={e.id} className="flex flex-wrap gap-2 py-2"><code>{e.type}</code><Pill tone={e.status === "failed" ? "bad" : e.status === "processed" ? "good" : "default"}>{e.status}</Pill>{e.error && <span className="text-deal-bad">{e.error}</span>}<span className="ml-auto text-xs text-subtle">{relativeTime(e.received_at)}</span></li>)}
          </ul>
        )}
      </Card>
    </div>
  );
}
