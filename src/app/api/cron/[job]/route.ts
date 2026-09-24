import { env, features } from "@/lib/env";
import { json } from "@/lib/server/api";
import { reportLeadCharges } from "@/lib/server/billing";
import { runDealerFeeds } from "@/lib/server/dealer-feed";
import { runEnrichment } from "@/lib/server/enrich";
import { runInsights } from "@/lib/server/insights";
import { runIngest } from "@/lib/server/ingest";
import { dispatchLeads } from "@/lib/server/leads";
import { pushPendingNotifications } from "@/lib/server/push";
import { createAdminClient } from "@/lib/supabase/admin";

const JOBS = ["ingest", "enrich", "dispatch", "maintenance", "stats", "insights", "feeds"] as const;
type Job = (typeof JOBS)[number];

/**
 * Scheduled jobs (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`).
 *   ingest      every 10 min   claim due markets, resume sweeps
 *   enrich      every 10 min   listing enrichment + photo embeddings
 *   dispatch    every 5 min    lead and notification retries
 *   maintenance hourly         offer expiry, stale listings, purges
 *   stats       daily          market price stats, deal ratings, listing funnels, dealer reply times
 *   insights    daily          demand-intelligence rollups (Phase 2)
 *   feeds       daily          pull dealer CSV feed URLs (Phase 2)
 */
export async function GET(req: Request, ctx: RouteContext<"/api/cron/[job]">) {
  const { job } = await ctx.params;
  if (!JOBS.includes(job as Job)) return json({ error: "unknown job" }, { status: 404 });
  const auth = req.headers.get("authorization");
  const devOpen = !env.cronSecret && process.env.NODE_ENV !== "production";
  if (!devOpen && (!env.cronSecret || auth !== `Bearer ${env.cronSecret}`)) return json({ error: "unauthorized" }, { status: 401 });
  if (!features.adminClient) return json({ error: "SUPABASE_SECRET_KEY is required for jobs" }, { status: 503 });

  const admin = createAdminClient();
  const started = Date.now();
  let result: unknown;
  switch (job as Job) {
    case "ingest":
      result = await runIngest(admin);
      break;
    case "enrich":
      result = await runEnrichment(admin);
      break;
    case "dispatch":
      result = { leads: await dispatchLeads(admin), pushed: await pushPendingNotifications(admin), billing: await reportLeadCharges(admin) };
      break;
    case "maintenance": {
      const { data, error } = await admin.rpc("run_maintenance");
      if (error) return json({ error: error.message }, { status: 500 });
      result = data;
      break;
    }
    case "stats": {
      const { data, error } = await admin.rpc("refresh_market_stats");
      if (error) return json({ error: error.message }, { status: 500 });
      const [{ data: funnels }, { data: dealers }] = await Promise.all([
        admin.rpc("rollup_listing_events", { p_days: 2 }),
        admin.rpc("refresh_dealer_stats"),
      ]);
      result = { rated: data, funnel_rows: funnels, dealers_timed: dealers };
      break;
    }
    case "insights":
      result = await runInsights(admin);
      break;
    case "feeds":
      result = await runDealerFeeds(admin);
      break;
  }
  return json({ job, ms: Date.now() - started, result });
}
