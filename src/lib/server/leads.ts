import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { buildAdfXml, relayAddress } from "../adf";
import { aiLeadSummary, type LeadDossier } from "../ai/summaries";
import { loadConfigAdmin } from "./admin-data";
import { env } from "../env";
import { usd } from "../format";
import type { AdminSupabase } from "../supabase/admin";
import { CAN_SPAM_FOOTER, sendEmail } from "./email";

const BACKOFF_MINUTES = [5, 15, 60, 240, 720];

/**
 * Deliver pending leads: write the AI lead summary, then route by channel.
 *   inbox     - dealer is on the platform; the notification already exists
 *   email_adf - ADF XML email with a relay reply-to and a claim link
 * Retries with backoff; gives up after 5 attempts.
 */
export async function dispatchLeads(admin: AdminSupabase, opts: { interestIds?: string[]; limit?: number } = {}) {
  let q = admin
    .from("lead_deliveries")
    .select("id, interest_id, dealership_id, channel, attempts")
    .eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .order("created_at")
    .limit(opts.limit ?? 25);
  if (opts.interestIds?.length) q = q.in("interest_id", opts.interestIds);
  const { data: deliveries, error } = await q;
  if (error) throw error;

  const config = await loadConfigAdmin(admin);
  const results = { sent: 0, failed: 0 };
  for (const d of deliveries ?? []) {
    try {
      const { data: interest } = await admin
        .from("interests")
        .select("id, user_id, kind, dossier, lead_summary, test_drive_windows, listing:listings(id, vin, year, make, model, trim_level, price, miles, condition, source_id), dealership:dealerships(id, name)")
        .eq("id", d.interest_id)
        .single();
      if (!interest?.listing) throw new Error("interest or listing missing");
      const listing = interest.listing as unknown as { id: string; vin: string; year: number; make: string; model: string; trim_level: string | null; price: number; miles: number; condition: "new" | "used" | "cpo"; source_id: string | null };
      const dealership = interest.dealership as unknown as { id: string; name: string } | null;
      const title = `${listing.year} ${listing.make} ${listing.model}${listing.trim_level ? ` ${listing.trim_level}` : ""}`;

      let summary = interest.lead_summary;
      let firstReply: string | null = null;
      if (!summary) {
        const s = await aiLeadSummary(interest.dossier as LeadDossier, { title, price: Number(listing.price) }, {
          store: admin, userId: interest.user_id, dailyBudgetUsd: config.ai.daily_budget_usd_per_user,
        });
        summary = s.summary;
        firstReply = s.firstReply;
        await admin.from("interests").update({ lead_summary: summary }).eq("id", interest.id);
      }

      if (d.channel === "email_adf" && dealership) {
        const { data: priv } = await admin.from("dealership_private").select("lead_email").eq("dealership_id", dealership.id).single();
        if (!priv?.lead_email) throw new Error("dealer has no lead email");
        const relay = relayAddress(interest.id, env.relayEmailDomain);
        const token = randomBytes(24).toString("base64url");
        await admin.from("dealership_claim_tokens").insert({
          dealership_id: dealership.id,
          token_hash: createHash("sha256").update(token).digest("hex"),
          interest_id: interest.id,
        });
        const claimUrl = `${env.siteUrl}/claim/${token}`;
        const dossier = interest.dossier as LeadDossier;
        const windows = (interest.test_drive_windows as { day: string; time: string }[] | null) ?? [];
        const comments = [
          summary,
          interest.kind === "superlike" && windows.length ? `Test drive requested: ${windows.map((w) => `${w.day} ${w.time}`).join(" or ")}.` : null,
          "Reply to this email with an itemized out-the-door offer; your reply reaches the buyer.",
        ].filter(Boolean).join(" ");
        const xml = buildAdfXml({
          id: interest.id,
          requestDate: new Date(),
          vehicle: { year: listing.year, make: listing.make, model: listing.model, trim: listing.trim_level, vin: listing.vin, stock: listing.source_id, price: Number(listing.price), condition: listing.condition, miles: listing.miles },
          customer: { firstName: dossier.first_name ?? null, relayEmail: relay, zip: dossier.zip ?? null, comments },
          dealerName: dealership.name,
          provider: { name: env.appName, url: env.siteUrl, email: env.leadsFrom },
        });
        const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;color:#0b1530">
<h2 style="margin:0 0 4px">${interest.kind === "superlike" ? "Test-drive request" : "New buyer interest"}: ${escapeHtml(title)}</h2>
<p style="color:#4a5578;margin:0 0 16px">Listed at ${usd(Number(listing.price))} · VIN ${escapeHtml(listing.vin)}</p>
<p>${escapeHtml(summary ?? "")}</p>
${firstReply ? `<p style="color:#4a5578"><em>Suggested first reply:</em> ${escapeHtml(firstReply)}</p>` : ""}
<p><strong>Reply to this email with your out-the-door offer</strong> (price, fees, tax, trade credit). The buyer's contact details are shared only if they pick your offer.</p>
<p><a href="${claimUrl}" style="display:inline-block;background:#6d5efc;color:#fff;padding:10px 16px;border-radius:10px;text-decoration:none">Claim your free dealer inbox</a></p>
${CAN_SPAM_FOOTER}
</div>`;
        await sendEmail({
          kind: "lead_adf",
          to: priv.lead_email,
          from: env.leadsFrom,
          replyTo: relay,
          subject: `CarSwipe lead: ${title} (VIN ${listing.vin.slice(-6)})`,
          text: xml,
          html,
          attachments: [{ filename: "lead.adf.xml", content: xml, contentType: "application/xml" }],
          meta: { interest_id: interest.id, dealership_id: dealership.id, claim_url: claimUrl },
        });
        await admin.from("lead_deliveries").update({ status: "sent", sent_at: new Date().toISOString(), relay_address: relay, attempts: d.attempts + 1 }).eq("id", d.id);
      } else {
        // Inbox dealers already have an in-app notification (created by record_swipes).
        await admin.from("lead_deliveries").update({ status: "sent", sent_at: new Date().toISOString(), attempts: d.attempts + 1 }).eq("id", d.id);
      }
      results.sent++;
    } catch (err) {
      results.failed++;
      const attempts = d.attempts + 1;
      const giveUp = attempts >= BACKOFF_MINUTES.length;
      await admin.from("lead_deliveries").update({
        attempts,
        status: giveUp ? "failed" : "pending",
        last_error: String((err as Error).message ?? err).slice(0, 500),
        next_attempt_at: new Date(Date.now() + BACKOFF_MINUTES[Math.min(attempts, BACKOFF_MINUTES.length - 1)] * 60_000).toISOString(),
      }).eq("id", d.id);
    }
  }
  return results;
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
