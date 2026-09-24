import "server-only";

import { mergeConfig, type AppConfig } from "../config";
import type { AdminSupabase } from "../supabase/admin";

export async function loadConfigAdmin(admin: AdminSupabase): Promise<AppConfig> {
  const { data } = await admin.from("app_config").select("key, value");
  return mergeConfig(data ?? []);
}
