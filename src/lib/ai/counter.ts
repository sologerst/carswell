import "server-only";

import { z } from "zod";
import type { CounterSuggestion } from "../negotiation";
import { usd } from "../format";
import { aiJson, type AiJsonOptions } from "./client";

const Schema = z.object({ message: z.string() });

export function templateCounter(s: { title: string; offerOtd: number; targetOtd: number; reasons: string[]; firstName: string | null; privateSale: boolean }): string {
  const why = s.reasons.slice(0, 2).map((r) => r.replace(/\.$/, "").replace(/^./, (c) => c.toLowerCase())).join(", and ");
  return `Thanks for the ${s.privateSale ? "price" : "offer"} on the ${s.title}. I'm ready to buy${s.privateSale ? "" : " this month"} at ${usd(s.targetOtd)} out the door${why ? `: ${why}` : ""}. If that works, I can move quickly.${s.firstName ? `\n\nThanks,\n${s.firstName}` : ""}`;
}

/** Counteroffer message (frontier model). The buyer edits and sends it; never automatic. */
export async function aiCounterMessage(input: {
  title: string; offerOtd: number; suggestion: CounterSuggestion; targetOtd: number; firstName: string | null; privateSale: boolean;
}, usage: AiJsonOptions<typeof Schema>["usage"]): Promise<{ body: string; source: "ai" | "template" }> {
  const fallback = templateCounter({ title: input.title, offerOtd: input.offerOtd, targetOtd: input.targetOtd, reasons: input.suggestion.reasons, firstName: input.firstName, privateSale: input.privateSale });
  const res = await aiJson({
    feature: "negotiator_counter",
    tier: "frontier",
    effort: "medium",
    maxTokens: 1500,
    system: `You draft a counteroffer from a car buyer to a ${input.privateSale ? "private seller" : "dealer"}. The buyer reviews it before sending.
Under 80 words, warm and firm. State the counter as an out-the-door number exactly as given. Use only the reasons given; never invent competing offers or facts.
No contact details, no emoji. Sign with the buyer's first name if known.`,
    schema: Schema,
    usage,
    messages: [{ role: "user", content: `Car: ${input.title}\nTheir offer: ${usd(input.offerOtd)} out the door\nCounter: ${usd(input.targetOtd)} out the door\nReasons (facts): ${input.suggestion.reasons.join(" ") || "none"}\nBuyer first name: ${input.firstName ?? "unknown"}` }],
  });
  if (!res?.data.message.trim()) return { body: fallback, source: "template" };
  return { body: res.data.message.trim().slice(0, 1500), source: "ai" };
}
