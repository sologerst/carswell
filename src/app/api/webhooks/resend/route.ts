import { env } from "@/lib/env";
import { json } from "@/lib/server/api";
import { handleInboundEmail } from "@/lib/server/inbound";
import { verifySvix } from "@/lib/server/svix";
import { createAdminClient } from "@/lib/supabase/admin";

interface ResendInbound {
  type?: string;
  data?: {
    email_id?: string;
    from?: string;
    to?: string[] | string;
    subject?: string;
    text?: string;
    html?: string;
  };
}

const htmlToText = (html: string) => html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");

/**
 * Inbound dealer email replies to relay addresses. [VERIFY] Resend's inbound
 * payload shape; if the body isn't in the webhook we fetch it by email_id.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!env.resendWebhookSecret) return json({ error: "RESEND_WEBHOOK_SECRET is not set" }, { status: 503 });
  if (!verifySvix(env.resendWebhookSecret, req.headers, raw)) return json({ error: "bad signature" }, { status: 401 });

  let payload: ResendInbound;
  try {
    payload = JSON.parse(raw) as ResendInbound;
  } catch {
    return json({ error: "invalid JSON" }, { status: 400 });
  }
  if (payload.type && payload.type !== "email.received") return json({ ok: true, ignored: payload.type });
  const d = payload.data ?? {};
  let text = d.text ?? (d.html ? htmlToText(d.html) : "");
  if (!text && d.email_id && env.resendApiKey) {
    const res = await fetch(`https://api.resend.com/emails/receiving/${d.email_id}`, {
      headers: { Authorization: `Bearer ${env.resendApiKey}` },
    });
    if (res.ok) {
      const full = (await res.json()) as { text?: string; html?: string };
      text = full.text ?? (full.html ? htmlToText(full.html) : "");
    }
  }
  const result = await handleInboundEmail(createAdminClient(), {
    from: d.from ?? "",
    to: Array.isArray(d.to) ? d.to : d.to ? [d.to] : [],
    subject: d.subject ?? "",
    text,
  });
  return json(result, { status: result.ok ? 200 : 202 });
}
