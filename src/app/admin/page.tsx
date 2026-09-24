import type { Metadata } from "next";
import { Card } from "@/components/ui/primitives";
import { features } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

async function count(table: string, filter?: (q: ReturnType<ReturnType<typeof createAdminClient>["from"]>) => unknown) {
  const admin = createAdminClient();
  let q = admin.from(table as "profiles").select("*", { count: "exact", head: true });
  if (filter) q = filter(q as never) as typeof q;
  const { count } = await q;
  return count ?? 0;
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 86400_000).toISOString();
}

export default async function AdminOverview() {
  const since30 = daysAgo(30);
  const admin = createAdminClient();
  const [users, onboarded, swipes, likes, likesWithOffer, offers, matches, purchases, leadsSent, leadsAnswered, listings, aiRows] = await Promise.all([
    count("profiles"),
    count("profiles", (q) => (q as unknown as { not: (c: string, o: string, v: null) => unknown }).not("onboarding_completed_at", "is", null)),
    count("swipes"),
    count("interests"),
    count("interests", (q) => (q as unknown as { in: (c: string, v: string[]) => unknown }).in("status", ["offered", "matched", "purchased", "declined"])),
    count("offers"),
    count("interests", (q) => (q as unknown as { in: (c: string, v: string[]) => unknown }).in("status", ["matched", "purchased"])),
    count("purchases"),
    count("lead_deliveries", (q) => (q as unknown as { in: (c: string, v: string[]) => unknown }).in("channel", ["inbox", "email_adf"])),
    count("interests", (q) => (q as unknown as { in: (c: string, v: string[]) => unknown }).in("status", ["offered", "matched", "purchased", "declined"])),
    count("listings", (q) => (q as unknown as { eq: (c: string, v: boolean) => unknown }).eq("is_active", true)),
    admin.from("ai_usage").select("cost_usd").gte("created_at", since30),
  ]);
  const aiCost = (aiRows.data ?? []).reduce((s, r) => s + Number(r.cost_usd), 0);
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

  const funnel: [string, string, string][] = [
    ["Sign-ups", String(users), "Acquire"],
    ["Onboarding completion", pct(onboarded, users), "Onboard · target [SET] by day 30"],
    ["Swipes", String(swipes), "Engage"],
    ["Likes", String(likes), "Intent"],
    ["Likes that receive an offer", pct(likesWithOffer, likes), "Dealer response · target [SET] by day 60"],
    ["Offers", String(offers), "Dealer response"],
    ["Matches (offer picked)", String(matches), "Match"],
    ["Purchases reported", String(purchases), "Close · target [SET] by day 90"],
  ];
  const killCriteria: [string, string, string][] = [
    ["Dealer reply rate on leads", pct(leadsAnswered, leadsSent), "Day 60 · target [SET]"],
    ["Paying dealers", "0 (invoiced by hand at MVP)", "Day 90 · minimum 3"],
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
        <p className="text-sm text-muted">North star: qualified matches that end in a purchase.</p>
      </div>
      <section>
        <h2 className="mb-3 font-bold">Kill criteria</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {killCriteria.map(([k, v, note]) => <Card key={k} className="p-5"><p className="text-sm text-muted">{k}</p><p className="mt-1 text-3xl font-bold">{v}</p><p className="mt-1 text-xs text-subtle">{note}</p></Card>)}
        </div>
      </section>
      <section>
        <h2 className="mb-3 font-bold">Funnel</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {funnel.map(([k, v, note]) => <Card key={k} className="p-5"><p className="text-sm text-muted">{k}</p><p className="mt-1 text-2xl font-bold">{v}</p><p className="mt-1 text-xs text-subtle">{note}</p></Card>)}
        </div>
      </section>
      <section className="grid gap-3 sm:grid-cols-3">
        <Card className="p-5"><p className="text-sm text-muted">Active listings</p><p className="mt-1 text-2xl font-bold">{listings}</p></Card>
        <Card className="p-5"><p className="text-sm text-muted">AI cost, last 30 days</p><p className="mt-1 text-2xl font-bold">${aiCost.toFixed(2)}</p><p className="mt-1 text-xs text-subtle">{onboarded ? `$${(aiCost / onboarded).toFixed(3)} per onboarded buyer` : ""}</p></Card>
        <Card className="p-5">
          <p className="text-sm text-muted">Integrations</p>
          <ul className="mt-2 space-y-1 text-sm">
            {Object.entries({ "Claude (AI)": features.ai, "Resend (email)": features.email, "Web Push": features.push, MarketCheck: features.marketcheck, "Twilio Verify": features.twilio }).map(([k, on]) => (
              <li key={k} className="flex justify-between"><span>{k}</span><span className={on ? "font-bold text-deal-good" : "text-subtle"}>{on ? "On" : "Fallback"}</span></li>
            ))}
          </ul>
        </Card>
      </section>
    </div>
  );
}
