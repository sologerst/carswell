// Deck latency benchmark (spec: p95 under 150 ms at 50,000 listings).
//
//   npm run seed && npm run perf:seed     # ~50k active listings, locally
//   npm run perf:deck                     # signs in as the demo buyer
//
// Times the same path as GET /api/deck: deck_candidates (PostgREST ->
// Postgres, which also returns the eligible count), then ranking, badges and
// cost math in TS.
// Env: PERF_RUNS (default 40), PERF_P95_MS (default 150).

import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { mergeConfig } from "../../src/lib/config";
import { buildFilters } from "../../src/lib/deck/filters";
import { buildBatch, cardBadges, matchReasons, type ScoreContext } from "../../src/lib/deck/ranking";
import { budgetFromPrefs, costForCar, maxPriceForBudget } from "../../src/lib/money";
import type { Database } from "../../src/lib/supabase/database.types";
import type { DeckCandidate, Prefs, PrefSource, Tier } from "../../src/lib/types";

loadEnvConfig(process.cwd());
const RUNS = Number(process.env.PERF_RUNS ?? 40);
const P95_BUDGET = Number(process.env.PERF_P95_MS ?? 150);

const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.ceil((p / 100) * xs.length) - 1)];

async function main() {
  const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "", {
    auth: { persistSession: false },
  });
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({ email: "buyer@carswipe.dev", password: "carswipe-demo" });
  if (authErr || !auth.user) throw new Error(`Sign-in failed (run npm run seed first): ${authErr?.message}`);

  const [{ data: profile }, { data: prefRows }, { data: cfgRows }, { data: affinities }, { count: active }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", auth.user.id).single(),
    supabase.from("buyer_preferences").select("key, value, tier, source").eq("user_id", auth.user.id),
    supabase.from("app_config").select("key, value"),
    supabase.from("user_affinities").select("attribute, likes, passes").eq("user_id", auth.user.id),
    supabase.from("listings").select("id", { count: "exact", head: true }).eq("is_active", true),
  ]);
  if (!profile) throw new Error("demo buyer profile missing");
  const config = mergeConfig(cfgRows ?? []);
  const prefs: Prefs = Object.fromEntries((prefRows ?? []).map((r) => [r.key, { value: r.value, tier: r.tier as Tier, source: r.source as PrefSource }]));
  const { data: zip } = await supabase.from("zip_codes").select("zip, city, lat, lng").eq("zip", profile.zip ?? "37203").single();
  const origin = { lat: zip!.lat, lng: zip!.lng };
  const budget = budgetFromPrefs(prefs, config.finance);

  // The gate is a real buyer's deck. "Wide open" (no criteria, every car in
  // range eligible) is a stress case: reported, not gated.
  const scenarios: { name: string; prefs: Prefs; radius: number; gate: boolean }[] = [
    { name: "demo buyer (SUV, budget, 40 mi)", prefs, radius: profile.radius_mi, gate: true },
    { name: "stress: no criteria, 150 mi (every car eligible)", prefs: {}, radius: 150, gate: false },
  ];

  console.log(`Active listings: ${active?.toLocaleString("en-US")}. Runs per scenario: ${RUNS}. Budget: p95 < ${P95_BUDGET} ms.\n`);
  let failed = false;
  for (const sc of scenarios) {
    const maxPrice = Object.keys(sc.prefs).length ? maxPriceForBudget(budget, config) : null;
    const filters = buildFilters({ prefs: sc.prefs, origin, radiusMi: sc.radius, maxPrice, excludeIds: [] });
    const scoreCtx: ScoreContext = {
      prefs: sc.prefs, affinities: new Map((affinities ?? []).map((a) => [a.attribute, a])), swipes: profile.swipe_count,
      radiusMi: sc.radius, maxPrice, config,
    };
    const times: number[] = [];
    const sql: number[] = [];
    let eligible = 0;
    let candidates = 0;
    for (let i = 0; i < RUNS + 3; i++) {
      const t0 = performance.now();
      const cand = await supabase.rpc("deck_candidates", { p_filters: filters as never, p_limit: config.deck.candidates, p_explore: config.deck.explore_candidates });
      const t1 = performance.now();
      if (cand.error) throw cand.error;
      const rows = (cand.data ?? []) as unknown as DeckCandidate[];
      const batch = buildBatch(rows, scoreCtx);
      for (const s of batch) {
        matchReasons(s, scoreCtx);
        cardBadges(s, sc.prefs);
        costForCar(s.car.price, s.car.condition, s.car.dealer_doc_fee, budget, config);
      }
      const t2 = performance.now();
      if (i >= 3) { // warm-up runs excluded
        times.push(t2 - t0);
        sql.push(t1 - t0);
      }
      eligible = Number(rows[0]?.total_eligible ?? 0);
      candidates = rows.length;
    }
    const p95 = pct(times, 95);
    const ok = p95 < P95_BUDGET;
    if (sc.gate) failed ||= !ok;
    console.log(`${sc.gate ? (ok ? "PASS" : "FAIL") : ok ? "OK  " : "INFO"}  ${sc.name}`);
    console.log(`      eligible ${eligible.toLocaleString("en-US")}, candidates ${candidates}`);
    console.log(`      total  p50 ${pct(times, 50).toFixed(1)} ms  p95 ${p95.toFixed(1)} ms  max ${Math.max(...times).toFixed(1)} ms`);
    console.log(`      SQL    p50 ${pct(sql, 50).toFixed(1)} ms  p95 ${pct(sql, 95).toFixed(1)} ms\n`);
  }
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
