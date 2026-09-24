import { z } from "zod";
import { ApiError, apiProfile, json, readJson, route } from "@/lib/server/api";
import { loadConfig } from "@/lib/server/data";
import { prequalify } from "@/lib/server/partners";
import { createAdminClient } from "@/lib/supabase/admin";

const Body = z.object({
  amount: z.number().min(1000).max(250_000),
  termMonths: z.number().int().min(12).max(96),
  creditTier: z.enum(["excellent", "good", "fair", "rebuilding"]),
  annualIncome: z.number().min(0).max(10_000_000).nullable(),
  consent: z.literal(true),
});

/** Soft-pull style pre-qualification through the finance partner (demo by default). */
export const POST = route(async (req: Request) => {
  const { supabase, profile } = await apiProfile();
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new ApiError(400, "Fill in the amount, term and credit range, and agree to share them.");
  const admin = createAdminClient();
  const { data: ok } = await admin.rpc("hit_rate_limit", { p_user: profile.id, p_bucket: "prequal", p_window_seconds: 86_400, p_max: 5 });
  if (ok === false) throw new ApiError(429, "You can check up to 5 times a day.");
  const r = await prequalify({ ...parsed.data, zip: profile.zip }, await loadConfig(supabase));
  await admin.from("finance_prequals").insert({
    user_id: profile.id, partner: r.partner, status: r.status, max_amount: r.maxAmount, apr: r.apr, term_months: r.termMonths,
    credit_tier: parsed.data.creditTier, reference: r.reference, expires_at: r.expiresAt,
  });
  return json(r);
});
