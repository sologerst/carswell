import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";
import { env } from "../env";
import { createAdminClient } from "../supabase/admin";
import { createClient } from "../supabase/server";
import type { Tables } from "../supabase/database.types";

export type Profile = Tables<"profiles">;

/** The signed-in user (verified with the auth server), or null. */
export const getUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
});

export const getProfile = cache(async (): Promise<Profile | null> => {
  const user = await getUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (data && !data.is_admin && user.email && env.adminBootstrapEmails.includes(user.email.toLowerCase()) && env.supabaseSecretKey) {
    // ADMIN_BOOTSTRAP_EMAILS promotes the first admins without touching SQL.
    await createAdminClient().from("profiles").update({ is_admin: true }).eq("id", user.id);
    return { ...data, is_admin: true };
  }
  return data;
});

export async function requireProfile(next = "/deck"): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect(`/login?next=${encodeURIComponent(next)}`);
  return profile;
}

/** Buyer pages: signed in and onboarded. */
export async function requireOnboarded(next = "/deck"): Promise<Profile> {
  const profile = await requireProfile(next);
  if (!profile.onboarding_completed_at) redirect("/onboarding");
  return profile;
}

export async function requireAdmin(): Promise<Profile> {
  const profile = await requireProfile("/admin");
  if (!profile.is_admin) redirect("/deck");
  return profile;
}

export interface DealerMembership {
  dealership_id: string;
  role: string;
  dealership: Tables<"dealerships">;
}

export const getDealerMemberships = cache(async (): Promise<DealerMembership[]> => {
  const user = await getUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("dealership_members")
    .select("dealership_id, role, dealership:dealerships(*)")
    .eq("user_id", user.id);
  return (data ?? []).filter((m) => m.dealership) as unknown as DealerMembership[];
});

export async function requireDealer(): Promise<{ profile: Profile; membership: DealerMembership }> {
  const profile = await requireProfile("/dealer");
  const memberships = await getDealerMemberships();
  if (!memberships.length) redirect("/deck");
  return { profile, membership: memberships[0] };
}
