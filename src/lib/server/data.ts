import "server-only";

import { cache } from "react";
import { mergeConfig, type AppConfig } from "../config";
import type { ServerSupabase } from "../supabase/server";
import type { Affinity, Pref, Prefs, Tier, PrefSource } from "../types";

/** app_config merged over the typed defaults. */
export const loadConfig = cache(async (supabase: ServerSupabase): Promise<AppConfig> => {
  const { data } = await supabase.from("app_config").select("key, value");
  return mergeConfig(data ?? []);
});

export async function loadPrefs(supabase: ServerSupabase, userId: string): Promise<Prefs> {
  const { data } = await supabase.from("buyer_preferences").select("key, value, tier, source").eq("user_id", userId);
  const prefs: Prefs = {};
  for (const row of data ?? []) {
    prefs[row.key] = { value: row.value, tier: row.tier as Tier, source: row.source as PrefSource };
  }
  return prefs;
}

export async function loadAffinities(supabase: ServerSupabase, userId: string): Promise<Affinity[]> {
  const { data } = await supabase.from("user_affinities").select("attribute, likes, passes").eq("user_id", userId);
  return data ?? [];
}

export async function upsertPrefs(supabase: ServerSupabase, userId: string, prefs: Record<string, Pref | null>) {
  const rows = Object.entries(prefs)
    .filter((e): e is [string, Pref] => e[1] !== null)
    .map(([key, p]) => ({ user_id: userId, key, value: p.value as never, tier: p.tier, source: p.source }));
  const deletes = Object.entries(prefs).filter(([, p]) => p === null).map(([k]) => k);
  if (rows.length) {
    const { error } = await supabase.from("buyer_preferences").upsert(rows, { onConflict: "user_id,key" });
    if (error) throw error;
  }
  if (deletes.length) {
    const { error } = await supabase.from("buyer_preferences").delete().eq("user_id", userId).in("key", deletes);
    if (error) throw error;
  }
}

export async function zipLocation(supabase: ServerSupabase, zip: string | null | undefined) {
  if (!zip) return null;
  const { data } = await supabase.from("zip_codes").select("zip, city, lat, lng").eq("zip", zip).maybeSingle();
  return data;
}
