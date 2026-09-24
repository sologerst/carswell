import type { Metadata } from "next";
import { TeamView } from "@/components/dealer/team-view";
import { requireDealer } from "@/lib/server/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const { profile, membership } = await requireDealer();
  const supabase = await createClient();
  const [{ data: members }, { data: invites }] = await Promise.all([
    supabase.from("dealership_members").select("user_id, role, created_at").eq("dealership_id", membership.dealership_id),
    supabase.from("dealership_invites").select("id, email, role, expires_at, accepted_at").eq("dealership_id", membership.dealership_id).order("created_at", { ascending: false }).limit(50),
  ]);
  // Teammates' names and emails (profiles are private under RLS; membership was checked above).
  const ids = (members ?? []).map((m) => m.user_id);
  const { data: people } = ids.length ? await createAdminClient().from("profiles").select("id, first_name, email").in("id", ids) : { data: [] };
  const person = new Map((people ?? []).map((p) => [p.id, p]));
  return (
    <TeamView
      meId={profile.id}
      isOwner={membership.role === "owner"}
      members={(members ?? []).map((m) => ({
        id: m.user_id, role: m.role, since: m.created_at,
        name: person.get(m.user_id)?.first_name ?? person.get(m.user_id)?.email?.split("@")[0] ?? "Teammate",
        email: person.get(m.user_id)?.email ?? null,
      }))}
      invites={(invites ?? []).map((i) => ({ ...i, email: String(i.email) }))}
    />
  );
}
