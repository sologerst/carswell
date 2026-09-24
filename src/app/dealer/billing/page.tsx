import type { Metadata } from "next";
import { BillingButton } from "@/components/dealer/billing-button";
import { Card, Pill, SectionTitle } from "@/components/ui/primitives";
import { usd } from "@/lib/format";
import { entitlements } from "@/lib/server/billing";
import { loadConfig } from "@/lib/server/data";
import { requireDealer } from "@/lib/server/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Billing" };

const LEADS_TEXT = {
  active: ["Active", "good"], past_due: ["Payment failed", "bad"], none: ["Not set up", "fair"],
  exempt: ["Invoiced by hand", "default"], dev: ["Dev entitlement", "accent"],
} as const;

export default async function BillingPage({ searchParams }: PageProps<"/dealer/billing">) {
  const { checkout } = await searchParams;
  const { membership } = await requireDealer();
  const supabase = await createClient();
  const d = membership.dealership;
  const owner = membership.role === "owner";
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const [config, ent, { data: charges }, { data: promos }, { data: subs }, { data: customer }] = await Promise.all([
    loadConfig(supabase),
    entitlements(supabase, d),
    supabase.from("lead_charges").select("id, amount_usd, status, created_at, interest:interests(listing:listings(year, make, model))")
      .eq("dealership_id", d.id).order("created_at", { ascending: false }).limit(100),
    supabase.from("promotions").select("id, days, amount_usd, status, starts_at, ends_at, created_at, listing:listings(year, make, model)")
      .eq("dealership_id", d.id).order("created_at", { ascending: false }).limit(50),
    supabase.from("subscriptions").select("product, status, current_period_end, cancel_at_period_end").eq("dealership_id", d.id),
    supabase.from("billing_customers").select("stripe_customer_id").eq("dealership_id", d.id).maybeSingle(),
  ]);
  const thisMonth = (charges ?? []).filter((c) => c.created_at >= monthStart && c.status !== "waived");
  const [leadsLabel, leadsTone] = LEADS_TEXT[ent.leads];
  const sub = (p: string) => (subs ?? []).find((s) => s.product === p);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Billing</h1>
        <p className="text-sm text-muted">You pay per matched lead (a buyer picked your offer), never per sale.{!ent.stripe && " Stripe isn't configured here, so billing runs on a dev entitlement."}</p>
      </div>
      {checkout === "success" && <p className="rounded-2xl bg-deal-good/10 px-4 py-3 text-sm font-bold text-deal-good" role="status">Thanks! Your subscription will show here within a minute.</p>}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="space-y-3 p-5">
          <SectionTitle>Matched leads</SectionTitle>
          <p className="text-3xl font-bold">{usd(config.billing.matched_lead_price_usd)}<span className="text-base font-normal text-muted"> / matched lead</span></p>
          <Pill tone={leadsTone}>{leadsLabel}</Pill>
          <p className="text-sm text-muted">{thisMonth.length} matched this month · {usd(thisMonth.reduce((s, c) => s + Number(c.amount_usd), 0))}</p>
          {ent.stripe && ent.leads === "none" && owner && <BillingButton body={{ action: "checkout", product: "leads" }} className="w-full">Add payment method</BillingButton>}
          {ent.leads === "none" && <p className="text-xs text-subtle">Leads keep arriving; matched leads are billed once a payment method is on file.</p>}
        </Card>
        <Card className="space-y-3 p-5">
          <SectionTitle>Demand insights</SectionTitle>
          <p className="text-3xl font-bold">{usd(config.billing.insights_monthly_usd)}<span className="text-base font-normal text-muted"> / month</span></p>
          <Pill tone={ent.insights ? "good" : "default"}>{ent.insights ? (ent.stripe ? "Subscribed" : "Dev entitlement") : "Not subscribed"}</Pill>
          {sub("insights")?.cancel_at_period_end && <p className="text-xs text-deal-fair">Cancels {new Date(sub("insights")!.current_period_end!).toLocaleDateString("en-US")}</p>}
          <p className="text-sm text-muted">Why cars get passed, the prices buyers tolerate, and local demand you&apos;re not stocking.</p>
          {ent.stripe && !ent.insights && owner && <BillingButton body={{ action: "checkout", product: "insights" }} className="w-full">Subscribe</BillingButton>}
        </Card>
        <Card className="space-y-3 p-5">
          <SectionTitle>Promotions</SectionTitle>
          <p className="text-3xl font-bold">{usd(config.billing.promotion_price_usd)}<span className="text-base font-normal text-muted"> / {config.billing.promotion_days} days</span></p>
          <p className="text-sm text-muted">Boost a car from Inventory. Promoted cards are always labeled.</p>
          {ent.stripe && customer && owner && <BillingButton body={{ action: "portal" }} variant="secondary" className="w-full">Invoices and payment method</BillingButton>}
        </Card>
      </div>

      <Card className="p-5">
        <SectionTitle>Matched leads</SectionTitle>
        {(charges ?? []).length === 0 ? <p className="text-sm text-muted">No matched leads yet.</p> : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-subtle"><tr><th className="py-2">Date</th><th>Car</th><th className="text-right">Amount</th><th className="text-right">Status</th></tr></thead>
            <tbody className="divide-y divide-line">
              {(charges ?? []).map((c) => {
                const l = (c.interest as unknown as { listing: { year: number; make: string; model: string } | null } | null)?.listing;
                return (
                  <tr key={c.id}>
                    <td className="py-2">{new Date(c.created_at).toLocaleDateString("en-US")}</td>
                    <td>{l ? `${l.year} ${l.make} ${l.model}` : "–"}</td>
                    <td className="text-right tabular-nums">{usd(Number(c.amount_usd))}</td>
                    <td className="text-right"><Pill tone={c.status === "reported" ? "good" : c.status === "failed" ? "bad" : "default"}>{c.status === "reported" ? "billed" : c.status === "pending" ? "unbilled" : c.status}</Pill></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {(promos ?? []).length > 0 && (
        <Card className="p-5">
          <SectionTitle>Promotions</SectionTitle>
          <ul className="divide-y divide-line text-sm">
            {(promos ?? []).map((p) => {
              const l = p.listing as unknown as { year: number; make: string; model: string } | null;
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="font-bold">{l ? `${l.year} ${l.make} ${l.model}` : "Listing"}</span>
                  <span className="text-muted">{p.ends_at ? `until ${new Date(p.ends_at).toLocaleDateString("en-US")}` : `${p.days} days`}</span>
                  <Pill tone={p.status === "active" || p.status === "dev" ? "good" : p.status === "failed" ? "bad" : "default"} className="ml-auto">{p.status}</Pill>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
