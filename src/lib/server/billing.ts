import "server-only";

import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppConfig } from "../config";
import { env, features } from "../env";
import type { AdminSupabase } from "../supabase/admin";
import type { Database, Tables } from "../supabase/database.types";
import { ApiError } from "./api";

// Billing (Phase 2): dealers pay per matched lead (never per sale) through a
// Stripe Billing Meter, can subscribe to demand insights, and can buy
// promoted placement. Without STRIPE_SECRET_KEY everything runs on a "dev
// entitlement": insights and promotions unlock and lead charges stay pending.

let client: Stripe | null = null;
export function getStripe(): Stripe | null {
  if (!features.stripe) return null;
  client ??= new Stripe(env.stripeSecretKey!, { maxNetworkRetries: 2, timeout: 20_000, appInfo: { name: env.appName } });
  return client;
}

export type LeadsBilling = "active" | "past_due" | "none" | "exempt" | "dev";

export interface Entitlements {
  stripe: boolean;
  leads: LeadsBilling;
  insights: boolean;
  promotions: boolean;
}

const ACTIVE = new Set(["active", "trialing"]);

export async function entitlements(db: SupabaseClient<Database>, dealership: Pick<Tables<"dealerships">, "id" | "billing_exempt">): Promise<Entitlements> {
  if (!features.stripe) return { stripe: false, leads: dealership.billing_exempt ? "exempt" : "dev", insights: true, promotions: true };
  const { data: subs } = await db.from("subscriptions").select("product, status").eq("dealership_id", dealership.id);
  const leadsSub = (subs ?? []).find((s) => s.product === "leads" && (ACTIVE.has(s.status) || s.status === "past_due"));
  return {
    stripe: true,
    leads: dealership.billing_exempt ? "exempt" : leadsSub ? (ACTIVE.has(leadsSub.status) ? "active" : "past_due") : "none",
    insights: (subs ?? []).some((s) => s.product === "insights" && ACTIVE.has(s.status)),
    promotions: Boolean(env.stripePricePromotion),
  };
}

async function ensureCustomer(admin: AdminSupabase, stripe: Stripe, dealership: Tables<"dealerships">, email: string | null): Promise<string> {
  const { data: existing } = await admin.from("billing_customers").select("stripe_customer_id").eq("dealership_id", dealership.id).maybeSingle();
  if (existing) return existing.stripe_customer_id;
  const customer = await stripe.customers.create({
    name: dealership.name,
    email: email ?? undefined,
    metadata: { dealership_id: dealership.id },
  }, { idempotencyKey: `customer-${dealership.id}` });
  await admin.from("billing_customers").insert({ dealership_id: dealership.id, stripe_customer_id: customer.id, email });
  return customer.id;
}

/** Stripe Checkout for the matched-lead plan (metered) or the insights plan. */
export async function subscriptionCheckout(admin: AdminSupabase, dealership: Tables<"dealerships">, email: string | null, product: "leads" | "insights"): Promise<string> {
  const stripe = getStripe();
  if (!stripe) throw new ApiError(409, "Billing isn't set up (STRIPE_SECRET_KEY). Dev entitlement is on.");
  const price = product === "leads" ? env.stripePriceMatchedLead : env.stripePriceInsights;
  if (!price) throw new ApiError(503, `Set STRIPE_PRICE_${product === "leads" ? "MATCHED_LEAD" : "INSIGHTS"}.`);
  const customer = await ensureCustomer(admin, stripe, dealership, email);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer,
    // Metered prices take no quantity; the meter reports usage.
    line_items: [product === "leads" ? { price } : { price, quantity: 1 }],
    success_url: `${env.siteUrl}/dealer/billing?checkout=success`,
    cancel_url: `${env.siteUrl}/dealer/billing?checkout=cancelled`,
    metadata: { dealership_id: dealership.id, product },
    subscription_data: { metadata: { dealership_id: dealership.id, product } },
  });
  if (!session.url) throw new ApiError(502, "Stripe didn't return a checkout link.");
  return session.url;
}

export async function billingPortal(admin: AdminSupabase, dealership: Tables<"dealerships">, email: string | null): Promise<string> {
  const stripe = getStripe();
  if (!stripe) throw new ApiError(409, "Billing isn't set up.");
  const customer = await ensureCustomer(admin, stripe, dealership, email);
  const session = await stripe.billingPortal.sessions.create({ customer, return_url: `${env.siteUrl}/dealer/billing` });
  return session.url;
}

/**
 * Promote a listing for N days. With Stripe: a one-time Checkout payment and
 * the webhook activates it. Without Stripe: activates immediately (dev).
 */
export async function startPromotion(admin: AdminSupabase, dealership: Tables<"dealerships">, listingId: string, userId: string, email: string | null, config: AppConfig): Promise<{ url: string | null; activated: boolean }> {
  const days = config.billing.promotion_days;
  const stripe = getStripe();
  const { data: promo, error } = await admin.from("promotions").insert({
    listing_id: listingId, dealership_id: dealership.id, days, amount_usd: config.billing.promotion_price_usd,
    status: stripe ? "pending" : "dev", created_by: userId,
  }).select("id").single();
  if (error) throw error;
  if (!stripe) {
    await activatePromotion(admin, promo.id);
    return { url: null, activated: true };
  }
  if (!env.stripePricePromotion) throw new ApiError(503, "Set STRIPE_PRICE_PROMOTION.");
  const customer = await ensureCustomer(admin, stripe, dealership, email);
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer,
    line_items: [{ price: env.stripePricePromotion, quantity: 1 }],
    success_url: `${env.siteUrl}/dealer/inventory?promoted=1`,
    cancel_url: `${env.siteUrl}/dealer/inventory`,
    metadata: { dealership_id: dealership.id, promotion_id: promo.id, listing_id: listingId },
    payment_intent_data: { metadata: { promotion_id: promo.id } },
  });
  await admin.from("promotions").update({ checkout_session_id: session.id }).eq("id", promo.id);
  return { url: session.url, activated: false };
}

async function activatePromotion(admin: AdminSupabase, promotionId: string) {
  const { data: promo } = await admin.from("promotions").select("*").eq("id", promotionId).single();
  if (!promo || promo.status === "active") return;
  const { data: listing } = await admin.from("listings").select("promoted_until").eq("id", promo.listing_id).single();
  const start = new Date(Math.max(Date.now(), listing?.promoted_until ? new Date(listing.promoted_until).getTime() : 0));
  const end = new Date(start.getTime() + promo.days * 86_400_000);
  await admin.from("promotions").update({ status: promo.status === "dev" ? "dev" : "active", starts_at: start.toISOString(), ends_at: end.toISOString() }).eq("id", promotionId);
  await admin.from("listings").update({ promoted_until: end.toISOString() }).eq("id", promo.listing_id);
}

/** Report pending matched-lead charges to the Stripe Billing Meter (dispatch job). */
export async function reportLeadCharges(admin: AdminSupabase, limit = 100) {
  const stripe = getStripe();
  if (!stripe) return { skipped: "no STRIPE_SECRET_KEY" };
  const { data: charges } = await admin.from("lead_charges").select("id, dealership_id, created_at, attempts")
    .eq("status", "pending").lt("attempts", 5).order("created_at").limit(limit);
  const results = { reported: 0, waiting: 0, failed: 0 };
  for (const c of charges ?? []) {
    const [{ data: customer }, { data: sub }] = await Promise.all([
      admin.from("billing_customers").select("stripe_customer_id").eq("dealership_id", c.dealership_id).maybeSingle(),
      admin.from("subscriptions").select("status").eq("dealership_id", c.dealership_id).eq("product", "leads").in("status", ["active", "trialing", "past_due"]).limit(1).maybeSingle(),
    ]);
    // No lead plan yet: stays pending (shown as unbilled) until the dealer subscribes.
    if (!customer || !sub) { results.waiting++; continue; }
    try {
      await stripe.billing.meterEvents.create({
        event_name: env.stripeMeterEvent,
        payload: { stripe_customer_id: customer.stripe_customer_id, value: "1" },
        // The charge id makes retries idempotent on Stripe's side.
        identifier: c.id,
        timestamp: Math.floor(Math.max(new Date(c.created_at).getTime(), Date.now() - 34 * 86_400_000) / 1000),
      });
      await admin.from("lead_charges").update({ status: "reported", meter_event_id: c.id, reported_at: new Date().toISOString(), attempts: c.attempts + 1, error: null }).eq("id", c.id);
      results.reported++;
    } catch (err) {
      const attempts = c.attempts + 1;
      await admin.from("lead_charges").update({ attempts, status: attempts >= 5 ? "failed" : "pending", error: String((err as Error).message ?? err).slice(0, 500) }).eq("id", c.id);
      results.failed++;
    }
  }
  return results;
}

function productOf(sub: Stripe.Subscription): "leads" | "insights" | null {
  const meta = sub.metadata?.product;
  if (meta === "leads" || meta === "insights") return meta;
  const prices = sub.items.data.map((i) => i.price.id);
  if (env.stripePriceMatchedLead && prices.includes(env.stripePriceMatchedLead)) return "leads";
  if (env.stripePriceInsights && prices.includes(env.stripePriceInsights)) return "insights";
  return null;
}

async function upsertSubscription(admin: AdminSupabase, sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  let dealershipId: string | undefined = sub.metadata?.dealership_id;
  if (!dealershipId) {
    const { data } = await admin.from("billing_customers").select("dealership_id").eq("stripe_customer_id", customerId).maybeSingle();
    dealershipId = data?.dealership_id;
  }
  const product = productOf(sub);
  if (!dealershipId || !product) return "ignored";
  const periodEnd = Math.max(0, ...sub.items.data.map((i) => i.current_period_end ?? 0));
  await admin.from("subscriptions").upsert({
    id: sub.id, dealership_id: dealershipId, stripe_customer_id: customerId, product, status: sub.status,
    price_id: sub.items.data[0]?.price.id ?? null,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    cancel_at_period_end: sub.cancel_at_period_end, updated_at: new Date().toISOString(),
  });
  return "processed";
}

/** Apply a verified Stripe webhook event. Idempotent through stripe_events. */
export async function handleStripeEvent(admin: AdminSupabase, event: Stripe.Event): Promise<string> {
  const { error: dup } = await admin.from("stripe_events").insert({ id: event.id, type: event.type });
  if (dup) {
    const { data: prior } = await admin.from("stripe_events").select("status").eq("id", event.id).single();
    if (prior?.status !== "failed") return "duplicate";
    await admin.from("stripe_events").update({ status: "processing", error: null }).eq("id", event.id);
  }
  const stripe = getStripe()!;
  try {
    let status = "ignored";
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object;
        if (s.mode === "subscription" && s.subscription) {
          const sub = await stripe.subscriptions.retrieve(typeof s.subscription === "string" ? s.subscription : s.subscription.id);
          status = await upsertSubscription(admin, sub);
        } else if (s.mode === "payment" && s.metadata?.promotion_id && s.payment_status === "paid") {
          await activatePromotion(admin, s.metadata.promotion_id);
          status = "processed";
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        status = await upsertSubscription(admin, event.data.object);
        break;
      case "invoice.payment_failed": {
        const inv = event.data.object;
        const customerId = typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
        const { data: bc } = customerId ? await admin.from("billing_customers").select("dealership_id").eq("stripe_customer_id", customerId).maybeSingle() : { data: null };
        if (bc) {
          const { data: members } = await admin.from("dealership_members").select("user_id").eq("dealership_id", bc.dealership_id).eq("role", "owner");
          if (members?.length) {
            await admin.from("notifications").insert(members.map((m) => ({
              user_id: m.user_id, kind: "billing", title: "Payment failed", body: "Update your payment method to keep receiving leads.", url: "/dealer/billing",
            })));
          }
          status = "processed";
        }
        break;
      }
    }
    await admin.from("stripe_events").update({ status, processed_at: new Date().toISOString() }).eq("id", event.id);
    return status;
  } catch (err) {
    await admin.from("stripe_events").update({ status: "failed", error: String((err as Error).message ?? err).slice(0, 500) }).eq("id", event.id);
    throw err;
  }
}
