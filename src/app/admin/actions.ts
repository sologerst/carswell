"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { env } from "@/lib/env";
import { runEnrichment } from "@/lib/server/enrich";
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
  if (job === "dispatch") result = { leads: await dispatchLeads(admin), pushed: await pushPendingNotifications(admin) };
  else if (job === "maintenance") result = (await admin.rpc("run_maintenance")).data;
  else if (job === "stats") result = (await admin.rpc("refresh_market_stats")).data;
  else if (job === "enrich") result = await runEnrichment(admin);
  else if (job === "ingest") result = await runIngest(admin);
  await audit(`job.${job}`, job, { result });
  revalidatePath("/admin/ingest");
}
