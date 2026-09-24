import { env } from "@/lib/env";
import { json } from "@/lib/server/api";
import { getStripe, handleStripeEvent } from "@/lib/server/billing";
import { createAdminClient } from "@/lib/supabase/admin";

/** Stripe webhooks: subscriptions, promotion payments, failed invoices. */
export async function POST(req: Request) {
  const stripe = getStripe();
  if (!stripe || !env.stripeWebhookSecret) return json({ error: "Stripe is not configured" }, { status: 503 });
  const signature = req.headers.get("stripe-signature");
  if (!signature) return json({ error: "missing signature" }, { status: 400 });
  const body = await req.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, env.stripeWebhookSecret);
  } catch {
    return json({ error: "invalid signature" }, { status: 400 });
  }
  try {
    const status = await handleStripeEvent(createAdminClient(), event);
    return json({ received: true, status });
  } catch (err) {
    console.error("[stripe webhook]", err);
    // 500 so Stripe retries.
    return json({ error: "processing failed" }, { status: 500 });
  }
}
