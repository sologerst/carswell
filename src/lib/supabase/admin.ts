import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { env } from "../env";
import type { Database } from "./database.types";

/**
 * Service-role client that bypasses RLS. Use only on the server, only after
 * checking the caller is allowed to do the thing, and never with user input
 * in place of an id you have verified.
 */
export function createAdminClient() {
  if (!env.supabaseSecretKey) {
    throw new Error("SUPABASE_SECRET_KEY is not set. Server jobs and message sending need it.");
  }
  return createSupabaseClient<Database>(env.supabaseUrl, env.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type AdminSupabase = ReturnType<typeof createAdminClient>;
