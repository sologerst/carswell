"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { env } from "@/lib/env";
import { runEnrichment } from "@/lib/server/enrich";
import { reportLeadCharges } from "@/lib/server/billing";
import { recomputeCanonicalForVins } from "@/lib/server/canonical";
import { runDealerFeeds } from "@/lib/server/dealer-feed";
import { runInsights } from "@/lib/server/insights";
import { goLive } from "@/lib/server/sell";
import { handleInboundEmail } from "@/lib/server/inbound";
import { runIngest } from "@/lib/server/ingest";
import { dispatchLeads } from "@/lib/server/leads";
import { pushPendingNotifications } from "@/lib/server/push";
import { requireAdmin } from "@/lib/server/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

async function audit(action: string, target: string, details: Record<string, unknown> = {}) {
  const profile = await requireAdmin();
  await createAdminClient().from("admin_audit_log").insert({ actor_id: profile.id, action, target, details: details as never });
}

export async function saveConfig(formData: FormData): Promise<void> {
  await requireAdmin();
  const key = String(formData.get("key"));
  let value: unknown;
  try {
    value = JSON.parse(String(formData.get("value")));
  } catch {
    throw new Error(`${key}: invalid JSON`);
  }
  // RLS allows admins to update app_config; the audit trigger records the change.
  const supabase = await createClient();
  const { error } = await supabase.from("app_config").update({ value: value as never }).eq("key", key);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/config");
}

export async function updateDealer(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id"));
  const admin = createAdminClient();
  const verified = formData.get("verified") === "on";
  const channel = String(formData.get("lead_channel"));
  const leadEmail = String(formData.get("lead_email") ?? "").trim();
  await admin.from("dealerships").update({
    verified_at: verified ? new Date().toISOString() : null,
    lead_channel: ["inbox", "email", "none"].includes(channel) ? (channel as "inbox" | "email" | "none") : "none",
  }).eq("id", id);
  await admin.from("dealership_private").upsert({ dealership_id: id, lead_email: leadEmail || null, lead_email_verified_at: leadEmail ? new Date().toISOString() : null });
  // Feed inventory from a self-serve dealer goes live only once it's verified.
  await admin.from("listings").update({ review_status: verified ? "approved" : "pending" })
    .eq("dealership_id", id).eq("source", "dealer_feed").in("review_status", verified ? ["pending"] : ["approved"]);
  if (verified) {
    const { data: feedCars } = await admin.from("listings").select("vin").eq("dealership_id", id).eq("source", "dealer_feed").eq("is_active", true);
    await recomputeCanonicalForVins(admin, (feedCars ?? []).map((l) => l.vin));
    const { data: members } = await admin.from("dealership_members").select("user_id").eq("dealership_id", id);
    if (members?.length) {
      await admin.from("notifications").insert(members.map((m) => ({
        user_id: m.user_id, kind: "dealer_verified", title: "Your dealership is verified", body: "Your inventory is live in buyer decks.", url: "/dealer/inventory",
      })));
    }
  }
  await audit("dealer.update", id, { verified, channel, leadEmail: Boolean(leadEmail) });
  revalidatePath("/admin/dealers");
}

export async function createClaimLink(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id"));
  const token = randomBytes(24).toString("base64url");
  await createAdminClient().from("dealership_claim_tokens").insert({ dealership_id: id, token_hash: createHash("sha256").update(token).digest("hex") });
  await audit("dealer.claim_link", id, { url: `${env.siteUrl}/claim/${token}` });
  revalidatePath("/admin/dealers");
}

export async function simulateDealerReply(formData: FormData): Promise<void> {
  await requireAdmin();
  const to = String(formData.get("to"));
  const text = String(formData.get("text"));
  const result = await handleInboundEmail(createAdminClient(), { from: "dealer@example.com", to: [to], subject: "Re: CarSwipe lead", text });
  await audit("outbox.simulate_reply", to, { result });
  revalidatePath("/admin/outbox");
}

export async function resolveReport(formData: FormData): Promise<void> {
  const profile = await requireAdmin();
  const id = String(formData.get("id"));
  const status = String(formData.get("status")) === "dismissed" ? "dismissed" : "resolved";
  await createAdminClient().from("reports").update({ status, resolved_by: profile.id, resolved_at: new Date().toISOString() }).eq("id", id);
  await audit(`report.${status}`, id);
  revalidatePath("/admin/reports");
}

export async function runJob(formData: FormData): Promise<void> {
  await requireAdmin();
  const job = String(formData.get("job"));
  const admin = createAdminClient();
  let result: unknown;
  if (job === "dispatch") result = { leads: await dispatchLeads(admin), pushed: await pushPendingNotifications(admin), billing: await reportLeadCharges(admin) };
  else if (job === "maintenance") result = (await admin.rpc("run_maintenance")).data;
  else if (job === "stats") {
    result = {
      rated: (await admin.rpc("refresh_market_stats")).data,
      funnels: (await admin.rpc("rollup_listing_events", { p_days: 2 })).data,
      dealers: (await admin.rpc("refresh_dealer_stats")).data,
    };
  } else if (job === "enrich") result = await runEnrichment(admin);
  else if (job === "ingest") result = await runIngest(admin);
  else if (job === "insights") result = await runInsights(admin);
  else if (job === "feeds") result = await runDealerFeeds(admin);
  await audit(`job.${job}`, job, { result });
  revalidatePath("/admin/ingest");
  revalidatePath("/admin/market");
}

export async function moderateListing(formData: FormData): Promise<void> {
  const profile = await requireAdmin();
  const id = String(formData.get("id"));
  const decision = String(formData.get("decision")) === "approve" ? "approve" : "reject";
  const reason = String(formData.get("reason") ?? "").slice(0, 500);
  const admin = createAdminClient();
  const { data: listing } = await admin.from("listings").select("*").eq("id", id).single();
  if (!listing) throw new Error("listing not found");
  const moderation = {
    ...((listing.moderation as Record<string, unknown>) ?? {}),
    decision, reason, decided_by: profile.id, decided_at: new Date().toISOString(),
  };
  if (decision === "approve") {
    await goLive(admin, listing, listing.expected_price === null ? null : Number(listing.expected_price), moderation);
  } else {
    await admin.from("listings").update({ review_status: "rejected", is_active: false, moderation: moderation as never }).eq("id", id);
  }
  if (listing.private_seller_id) {
    await admin.from("notifications").insert({
      user_id: listing.private_seller_id, kind: "moderation",
      title: decision === "approve" ? "Your car is live" : "Your listing wasn't approved",
      body: decision === "approve" ? `${listing.year} ${listing.make} ${listing.model}` : reason || "It didn't pass our safety review.",
      url: `/sell/listings/${id}`,
    });
  }
  await audit(`listing.${decision}`, id, { reason });
  revalidatePath("/admin/moderation");
}
