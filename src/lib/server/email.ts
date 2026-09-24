import "server-only";

import { env, features } from "../env";
import { createAdminClient } from "../supabase/admin";

export interface OutboundEmail {
  kind: string;
  to: string;
  from?: string;
  replyTo?: string;
  subject: string;
  text?: string;
  html?: string;
  attachments?: { filename: string; content: string; contentType?: string }[];
  meta?: Record<string, unknown>;
}

/**
 * Sends through Resend when RESEND_API_KEY is set; otherwise writes to the
 * dev_outbox table (visible in Admin > Outbox) so local flows still work.
 */
export async function sendEmail(email: OutboundEmail): Promise<{ id: string; via: "resend" | "dev_outbox" }> {
  const from = email.from ?? env.emailFrom;
  if (features.email) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [email.to],
        reply_to: email.replyTo,
        subject: email.subject,
        text: email.text,
        html: email.html,
        attachments: email.attachments?.map((a) => ({
          filename: a.filename,
          content: Buffer.from(a.content).toString("base64"),
          content_type: a.contentType,
        })),
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok || !body.id) throw new Error(`Resend error ${res.status}: ${body.message ?? "unknown"}`);
    return { id: body.id, via: "resend" };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("dev_outbox")
    .insert({
      kind: email.kind,
      to_address: email.to,
      from_address: from,
      reply_to: email.replyTo ?? null,
      subject: email.subject,
      text_body: email.text ?? null,
      html_body: email.html ?? null,
      attachments: (email.attachments ?? []) as never,
      meta: (email.meta ?? {}) as never,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id, via: "dev_outbox" };
}

export const CAN_SPAM_FOOTER = `<p style="color:#8a93ad;font-size:12px;margin-top:24px">You received this because a buyer on CarSwipe liked a car you listed. CarSwipe is an advertising and matching platform, not a dealer or broker. To stop receiving leads, reply STOP. CarSwipe, Nashville, TN.</p>`;
