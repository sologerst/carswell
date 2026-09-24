import "server-only";

import { z } from "zod";
import { parseRelayAddress } from "../adf";
import { aiJson } from "../ai/client";
import { scoreMessage } from "../safety/scam";
import { parseOfferFromText, stripQuoted } from "./offer-parse";
import type { AdminSupabase } from "../supabase/admin";

export interface InboundEmail {
  from: string;
  to: string[];
  subject: string;
  text: string;
}

const OfferSchema = z.object({
  otd_total: z.number().nullable(),
  vehicle_price: z.number().nullable(),
  fees: z.number().nullable(),
  summary: z.string(),
});

export type InboundResult =
  | { ok: true; kind: "offer"; offerId: string }
  | { ok: true; kind: "message"; messageId: string }
  | { ok: true; kind: "note" }
  | { ok: false; reason: string };

/** An off-platform dealer replied to a relay address. */
export async function handleInboundEmail(admin: AdminSupabase, email: InboundEmail): Promise<InboundResult> {
  const interestId = email.to.map(parseRelayAddress).find(Boolean);
  if (!interestId) return { ok: false, reason: "no relay address" };

  const { data: interest } = await admin
    .from("interests")
    .select("id, user_id, status, dealership_id, listing:listings(year, make, model, price)")
    .eq("id", interestId)
    .maybeSingle();
  if (!interest || !interest.dealership_id) return { ok: false, reason: "unknown lead" };
  const listing = interest.listing as unknown as { year: number; make: string; model: string; price: number };
  const title = `${listing.year} ${listing.make} ${listing.model}`;
  const body = stripQuoted(email.text);

  // After a match, replies go straight into the chat.
  const { data: conversation } = await admin.from("conversations").select("id").eq("interest_id", interestId).maybeSingle();
  if (conversation) {
    const scam = scoreMessage(body, { matched: true });
    const { data: msg, error } = await admin.from("messages").insert({
      conversation_id: conversation.id, sender_id: null, sender_role: "dealer", kind: "text",
      body: body.slice(0, 4000) || "(empty reply)", meta: { via: "email", from: email.from }, scam_score: scam.score, flagged: scam.flagged,
    }).select("id").single();
    if (error) return { ok: false, reason: error.message };
    return { ok: true, kind: "message", messageId: msg.id };
  }

  // Before a match, a reply is (usually) an offer.
  let parsed = parseOfferFromText(email.text);
  const ai = await aiJson({
    feature: "inbound_offer",
    tier: "fast",
    maxTokens: 600,
    system: "Extract a car dealer's offer from their email. otd_total is the total out-the-door price including tax, title and fees; null if not stated. Use only numbers written in the email.",
    schema: OfferSchema,
    messages: [{ role: "user", content: `Car: ${title}, listed $${listing.price}\n\nEmail:\n${body.slice(0, 6000)}` }],
  });
  if (ai?.data.otd_total) {
    parsed = { otdTotal: ai.data.otd_total, vehiclePrice: ai.data.vehicle_price, fees: ai.data.fees, notes: ai.data.summary || parsed.notes };
  }

  if (parsed.otdTotal && ["sent", "offered", "expired"].includes(interest.status)) {
    const vehiclePrice = parsed.vehiclePrice ?? Number(listing.price);
    const { data: offer, error } = await admin.from("offers").insert({
      interest_id: interestId, dealership_id: interest.dealership_id, source: "email",
      vehicle_price: vehiclePrice, dealer_fees: parsed.fees ?? 0, otd_total: parsed.otdTotal,
      notes: parsed.notes.slice(0, 2000),
    }).select("id").single();
    if (error) return { ok: false, reason: error.message };
    await admin.from("interests").update({ status: "offered" }).eq("id", interestId).in("status", ["sent", "expired"]);
    await admin.from("notifications").insert({
      user_id: interest.user_id, kind: "new_offer", title: "You have an offer",
      body: `Out-the-door offer on the ${title}`, url: `/offers#${interestId}`,
    });
    return { ok: true, kind: "offer", offerId: offer.id };
  }

  await admin.from("notifications").insert({
    user_id: interest.user_id, kind: "dealer_reply", title: `The dealer replied about the ${title}`,
    body: body.slice(0, 180), url: `/likes`,
  });
  return { ok: true, kind: "note" };
}
