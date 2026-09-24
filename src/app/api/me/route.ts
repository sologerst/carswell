import { apiProfile, json, route } from "@/lib/server/api";
import { createAdminClient } from "@/lib/supabase/admin";

/** Data export: everything we hold about the signed-in buyer (RLS-scoped reads). */
export const GET = route(async () => {
  const { supabase, profile } = await apiProfile();
  const tables = ["buyer_preferences", "user_affinities", "swipes", "interests", "message_drafts", "car_briefs", "ai_usage", "purchases", "seller_reviews", "notifications", "push_subscriptions", "reports", "blocks"] as const;
  const out: Record<string, unknown> = { profile, exported_at: new Date().toISOString() };
  for (const t of tables) {
    const col = t === "reports" ? "reporter_id" : "user_id";
    // Dynamic table names defeat the typed builder; each table is RLS-scoped to the caller anyway.
    const { data } = await (supabase.from(t) as unknown as { select(c: string): { eq(c: string, v: string): PromiseLike<{ data: unknown[] | null }> } }).select("*").eq(col, profile.id);
    out[t] = data ?? [];
  }
  return new Response(JSON.stringify(out, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="carswipe-data-${profile.id}.json"` },
  });
});

/** Account deletion: removes the auth user; profile data cascades. */
export const DELETE = route(async () => {
  const { profile } = await apiProfile();
  const admin = createAdminClient();
  await admin.from("admin_audit_log").insert({ actor_id: null, action: "account.delete", target: profile.id, details: {} });
  const { error } = await admin.auth.admin.deleteUser(profile.id);
  if (error) return json({ error: error.message }, { status: 500 });
  return json({ ok: true });
});
