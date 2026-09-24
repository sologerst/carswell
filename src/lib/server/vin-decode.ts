import "server-only";

import { env, features } from "../env";
import { createAdminClient } from "../supabase/admin";
import { isValidVin } from "../vin";

const DAY = 86_400_000;

interface VpicResult { Variable: string; Value: string | null }
interface RecallResult { NHTSACampaignNumber: string; Component: string; Summary: string; Remedy: string; ReportReceivedDate: string }

export type VinDecode = Record<string, string>;
export interface Recall { campaign: string; component: string; summary: string; remedy: string; date: string }

const WANTED = ["Make", "Model", "Model Year", "Trim", "Body Class", "Drive Type", "Fuel Type - Primary",
  "Engine Number of Cylinders", "Displacement (L)", "Doors", "Seats", "Plant Country", "Transmission Style"];

/**
 * VIN decode (NHTSA vPIC) + open recalls (NHTSA), cached in vin_decodes for
 * 30 / 7 days. Returns whatever is cached when NHTSA is unavailable.
 */
export async function decodeVin(rawVin: string): Promise<{ vin: string; decode: VinDecode | null; recalls: Recall[] }> {
  const vin = rawVin.trim().toUpperCase();
  if (!isValidVin(vin)) throw new Error("invalid VIN");
  const admin = features.adminClient ? createAdminClient() : null;
  const { data: cached } = admin ? await admin.from("vin_decodes").select("*").eq("vin", vin).maybeSingle() : { data: null };
  const fresh = (iso: string | null | undefined, maxAge: number) => iso && Date.now() - new Date(iso).getTime() < maxAge;
  let data = (cached?.data ?? null) as VinDecode | null;
  let recalls = (cached?.recalls ?? null) as Recall[] | null;

  try {
    if (!fresh(cached?.decoded_at, 30 * DAY)) {
      const res = await fetch(`${env.nhtsaVpicBase}/DecodeVin/${vin}?format=json`, { signal: AbortSignal.timeout(8000) });
      const body = (await res.json()) as { Results: VpicResult[] };
      data = Object.fromEntries(body.Results.filter((r) => WANTED.includes(r.Variable) && r.Value).map((r) => [r.Variable, r.Value as string]));
    }
    if (!fresh(cached?.recalls_checked_at, 7 * DAY) && data) {
      const res = await fetch(`${env.nhtsaApiBase}/recalls/recallsByVehicle?make=${encodeURIComponent(data.Make ?? "")}&model=${encodeURIComponent(data.Model ?? "")}&modelYear=${data["Model Year"] ?? ""}`, { signal: AbortSignal.timeout(8000) });
      const body = (await res.json()) as { results?: RecallResult[] };
      recalls = (body.results ?? []).slice(0, 20).map((r) => ({ campaign: r.NHTSACampaignNumber, component: r.Component, summary: r.Summary, remedy: r.Remedy, date: r.ReportReceivedDate }));
    }
    if (admin && (data !== cached?.data || recalls !== cached?.recalls)) {
      await admin.from("vin_decodes").upsert({
        vin, data: data as never, recalls: recalls as never,
        decoded_at: new Date().toISOString(), recalls_checked_at: new Date().toISOString(),
      });
    }
  } catch {
    // NHTSA unavailable: serve whatever is cached.
  }
  return { vin, decode: data, recalls: recalls ?? [] };
}

/** Year / make / model from a vPIC decode, when present. */
export function decodedBasics(d: VinDecode | null): { year: number | null; make: string | null; model: string | null; trim: string | null } {
  if (!d) return { year: null, make: null, model: null, trim: null };
  const title = (s: string | undefined) => (s ? s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()) : null);
  return {
    year: d["Model Year"] ? Number(d["Model Year"]) : null,
    make: title(d.Make),
    model: d.Model ?? null,
    trim: d.Trim ?? null,
  };
}
