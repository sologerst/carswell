import { apiProfile, json, route } from "@/lib/server/api";
import { createAdminClient } from "@/lib/supabase/admin";

/** Data export: everything we hold about the signed-in buyer (RLS-scoped reads). */
export const GET = route(async () => {
  const { supabase, profile } = await apiProfile();
  const tables = ["buyer_preferences", "user_affinities", "swipes", "interests", "message_drafts", "car_briefs", "ai_usage", "purchases", "seller_reviews", "notifications", "push_subscriptions", "reports", "blocks",
    "counteroffers", "finance_prequals", "insurance_quotes", "trade_estimates", "vault_documents", "inspection_requests", "listings"] as const;
  const out: Record<string, unknown> = { profile, exported_at: new Date().toISOString() };
  for (const t of tables) {
    const col = t === "reports" ? "reporter_id" : t === "counteroffers" ? "buyer_id" : t === "listings" ? "private_seller_id" : "user_id";
    // Dynamic table names defeat the typed builder; each table is RLS-scoped to the caller anyway.
    const { data } = await (supabase.from(t) as unknown as { select(c: string): { eq(c: string, v: string): PromiseLike<{ data: unknown[] | null }> } }).select("*").eq(col, profile.id);
    out[t] = data ?? [];
  }
  return new Response(JSON.stringify(out, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="carswipe-data-${profile.id}.json"` },
  });
});

/** Files under "<user id>/" in a bucket, recursing one folder level (listing photos). */
async function userFiles(admin: ReturnType<typeof createAdminClient>, bucket: string, uid: string): Promise<string[]> {
  const out: string[] = [];
  const { data: top } = await admin.storage.from(bucket).list(uid, { limit: 1000 });
  for (const entry of top ?? []) {
    if (entry.id) out.push(`${uid}/${entry.name}`);
    else {
      const { data: inner } = await admin.storage.from(bucket).list(`${uid}/${entry.name}`, { limit: 1000 });
      for (const f of inner ?? []) if (f.id) out.push(`${uid}/${entry.name}/${f.name}`);
    }
  }
  return out;
}

/** Account deletion: takes down private listings, deletes uploaded files, then the auth user (data cascades). */
export const DELETE = route(async () => {
  const { profile } = await apiProfile();
  const admin = createAdminClient();
  await admin.from("admin_audit_log").insert({ actor_id: null, action: "account.delete", target: profile.id, details: {} });
  await admin.from("listings").update({ is_active: false, is_canonical: false, review_status: "removed" })
    .eq("private_seller_id", profile.id);
  for (const bucket of ["listing-photos", "vault", "trade-photos"]) {
    const paths = await userFiles(admin, bucket, profile.id);
    for (let i = 0; i < paths.length; i += 100) await admin.storage.from(bucket).remove(paths.slice(i, i + 100));
  }
  const { error } = await admin.auth.admin.deleteUser(profile.id);
  if (error) return json({ error: error.message }, { status: 500 });
  return json({ ok: true });
});
