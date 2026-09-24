import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Card, Pill } from "@/components/ui/primitives";
import { createAdminClient } from "@/lib/supabase/admin";
import { runJob } from "../actions";

export const metadata: Metadata = { title: "Jobs & ingest" };
export const dynamic = "force-dynamic";

const JOBS = [
  ["ingest", "Ingest", "MarketCheck sweep (needs a key)"],
  ["enrich", "Enrich", "Feature extraction + style embeddings"],
  ["dispatch", "Dispatch", "Lead emails, summaries, push"],
  ["maintenance", "Maintenance", "Expire offers and stale listings"],
  ["stats", "Stats", "Price regressions and deal ratings"],
] as const;

export default async function AdminIngest() {
  const admin = createAdminClient();
  const [{ data: runs }, { data: markets }, { data: deliveries }] = await Promise.all([
    admin.from("ingest_runs").select("*").order("started_at", { ascending: false }).limit(30),
    admin.from("markets").select("*").order("priority"),
    admin.from("lead_deliveries").select("status, channel"),
  ]);
  const tally = (deliveries ?? []).reduce<Record<string, number>>((acc, d) => ({ ...acc, [`${d.channel}:${d.status}`]: (acc[`${d.channel}:${d.status}`] ?? 0) + 1 }), {});
  return (
    <div className="space-y-8">
      <section>
        <h1 className="mb-4 text-2xl font-bold tracking-tight">Jobs</h1>
        <p className="mb-4 text-sm text-muted">Vercel Cron runs these on schedule (see vercel.json). Run one now:</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {JOBS.map(([job, label, desc]) => (
            <form key={job} action={runJob}>
              <input type="hidden" name="job" value={job} />
              <Card className="flex h-full flex-col p-4">
                <p className="font-bold">{label}</p>
                <p className="mb-3 flex-1 text-xs text-muted">{desc}</p>
                <Button size="sm" variant="secondary" type="submit">Run</Button>
              </Card>
            </form>
          ))}
        </div>
      </section>
      <section>
        <h2 className="mb-3 text-lg font-bold">Lead deliveries</h2>
        <div className="flex flex-wrap gap-2">{Object.entries(tally).map(([k, v]) => <Pill key={k}>{k} · {v}</Pill>)}</div>
      </section>
      <section>
        <h2 className="mb-3 text-lg font-bold">Markets</h2>
        <ul className="space-y-1 text-sm">{(markets ?? []).map((m) => <li key={m.id}>{m.name} · center {m.center_zip} · {m.radius_mi} mi · {m.is_active ? "active" : "paused"}</li>)}</ul>
      </section>
      <section>
        <h2 className="mb-3 text-lg font-bold">Ingest runs</h2>
        <ul className="space-y-2 text-sm">
          {(runs ?? []).map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-navy-900 px-4 py-3">
              <Pill tone={r.status === "succeeded" ? "good" : r.status === "failed" ? "bad" : "fair"}>{r.status}</Pill>
              <span className="font-bold">{r.source}</span><span className="text-muted">{r.market_id}</span>
              <code className="text-xs text-subtle">{JSON.stringify(r.stats)}</code>
              {r.error && <span className="text-deal-bad">{r.error}</span>}
              <span className="ml-auto text-xs text-subtle">{new Date(r.started_at).toLocaleString("en-US")}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
