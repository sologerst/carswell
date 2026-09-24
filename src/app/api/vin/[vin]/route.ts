import { env, features } from "@/lib/env";
import { ApiError, apiProfile, json, route } from "@/lib/server/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidVin } from "@/lib/vin";

const DAY = 86_400_000;

interface VpicResult { Variable: string; Value: string | null }
interface RecallResult { NHTSACampaignNumber: string; Component: string; Summary: string; Remedy: string; ReportReceivedDate: string }

/** VIN decode (NHTSA vPIC) + open recalls (NHTSA), cached for 30 / 7 days. */
export const GET = route(async (_req: Request, ctx: RouteContext<"/api/vin/[vin]">) => {
  const { vin: raw } = await ctx.params;
  const vin = raw.toUpperCase();
  if (!isValidVin(vin)) throw new ApiError(400, "That VIN doesn't pass the check-digit test.");
  const { supabase } = await apiProfile();

  const { data: cached } = await supabase.from("vin_decodes").select("*").eq("vin", vin).maybeSingle();
  const fresh = (iso: string | null | undefined, maxAge: number) => iso && Date.now() - new Date(iso).getTime() < maxAge;
  let data = cached?.data ?? null;
  let recalls = cached?.recalls ?? null;

  try {
    if (!fresh(cached?.decoded_at, 30 * DAY)) {
      const res = await fetch(`${env.nhtsaVpicBase}/DecodeVin/${vin}?format=json`, { signal: AbortSignal.timeout(8000) });
      const body = (await res.json()) as { Results: VpicResult[] };
      const wanted = ["Make", "Model", "Model Year", "Trim", "Body Class", "Drive Type", "Fuel Type - Primary", "Engine Number of Cylinders", "Displacement (L)", "Doors", "Seats", "Plant Country", "Transmission Style"];
      data = Object.fromEntries(body.Results.filter((r) => wanted.includes(r.Variable) && r.Value).map((r) => [r.Variable, r.Value]));
    }
    if (!fresh(cached?.recalls_checked_at, 7 * DAY) && data) {
      const d = data as Record<string, string>;
      const res = await fetch(`${env.nhtsaApiBase}/recalls/recallsByVehicle?make=${encodeURIComponent(d.Make ?? "")}&model=${encodeURIComponent(d.Model ?? "")}&modelYear=${d["Model Year"] ?? ""}`, { signal: AbortSignal.timeout(8000) });
      const body = (await res.json()) as { results?: RecallResult[] };
      recalls = (body.results ?? []).slice(0, 20).map((r) => ({ campaign: r.NHTSACampaignNumber, component: r.Component, summary: r.Summary, remedy: r.Remedy, date: r.ReportReceivedDate }));
    }
    if (features.adminClient && (data !== cached?.data || recalls !== cached?.recalls)) {
      await createAdminClient().from("vin_decodes").upsert({
        vin, data: data as never, recalls: recalls as never,
        decoded_at: new Date().toISOString(), recalls_checked_at: new Date().toISOString(),
      });
    }
  } catch {
    // NHTSA unavailable: serve whatever is cached.
  }
  return json({ vin, decode: data, recalls: recalls ?? [], source: "NHTSA vPIC and Recalls APIs" });
});
