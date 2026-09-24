import "server-only";

import { z } from "zod";
import { BODY_LABEL, DRIVE_LABEL, FUEL_LABEL, type BodyStyle, type Prefs, type TradeIn } from "../types";
import { featureLabel } from "../criteria/features";
import { usd } from "../format";
import { aiJson, type AiJsonOptions } from "./client";

// "What the AI thinks you want" (buyer profile) and the dealer lead summary.

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} or ${xs[xs.length - 1]}`);

export function templateProfileSummary(prefs: Prefs): string {
  const v = <T,>(k: string) => (prefs[k] && prefs[k].tier !== "dont_care" ? (prefs[k].value as T) : undefined);
  const bodies = v<BodyStyle[]>("body_styles");
  const what = bodies?.length ? list(bodies.map((b) => BODY_LABEL[b])) : "car";
  const budget = v<string>("budget_mode") === "cash"
    ? (v<number>("max_cash_price") ? ` under ${usd(v<number>("max_cash_price"))}` : "")
    : v<number>("max_monthly_payment") ? ` under $${v<number>("max_monthly_payment")}/mo` : "";
  const bits: string[] = [];
  const drives = v<string[]>("drivetrains");
  if (drives?.length) {
    const why = prefs.life_offroad ? " for the lake roads" : prefs.life_weather ? " for hills and ice" : prefs.life_towing ? " for towing" : "";
    bits.push(`${list(drives.map((d) => DRIVE_LABEL[d as keyof typeof DRIVE_LABEL] ?? d))}${why}`);
  }
  const seats = v<number>("min_seats");
  const carSeats = v<number>("car_seats");
  if (carSeats) bits.push(`room for ${carSeats} car seat${carSeats > 1 ? "s" : ""}`);
  else if (seats && seats >= 6) bits.push(`${seats} seats`);
  const fuels = v<string[]>("fuel_types");
  if (fuels?.length && fuels.length < 4) bits.push(list(fuels.map((f) => FUEL_LABEL[f as keyof typeof FUEL_LABEL] ?? f).map((s) => s.toLowerCase())));
  if (prefs.pet_friendly) bits.push("space for the dog");
  if (prefs.towing_min) bits.push(`towing ${Number(prefs.towing_min.value).toLocaleString("en-US")} lb`);
  const musts = Object.entries(prefs).filter(([k, p]) => k.startsWith("feature:") && p.tier === "must").map(([k]) => featureLabel(k.slice(8)));
  if (musts.length) bits.push(`must have ${list(musts)}`);
  const style = v<string[]>("visual_style");
  const tail = style?.length ? `, leaning toward ${list(style)} styles` : "";
  const article = /^[AEIOU]/i.test(what) ? "An" : "A";
  return `${article} ${what}${budget}${bits.length ? `, ${bits.join(", ")}` : ""}${tail}.`;
}

export interface LeadDossier {
  first_name?: string | null;
  zip?: string | null;
  preferences?: Record<string, unknown>;
  top_tastes?: string[];
  ai_summary?: string | null;
  swipe_count?: number;
}

export function templateLeadSummary(d: LeadDossier, car: { title: string; price: number }): { summary: string; firstReply: string } {
  const p = d.preferences ?? {};
  const name = d.first_name ?? "This buyer";
  const budget = p.budget_mode === "cash"
    ? p.max_cash_price ? `paying cash up to ${usd(Number(p.max_cash_price))}` : "paying cash"
    : p.max_monthly_payment ? `financing about $${p.max_monthly_payment}/mo${p.down_payment ? ` with ${usd(Number(p.down_payment))} down` : ""}` : "budget not shared";
  const trade = p.trade_in as TradeIn | undefined;
  const tradeText = trade?.has ? `a trade-in${trade.description ? ` (${trade.description})` : ""}${trade.value ? ` they value near ${usd(trade.value)}` : ""}` : "no trade";
  const timeline = { week: "this week", month: "this month", quarter: "in 1-3 months", browsing: "while browsing" }[String(p.timeline)] ?? "soon";
  const credit = p.credit_tier ? `${p.credit_tier} credit` : null;
  const financing = p.financing_status === "preapproved" ? "pre-approved" : p.financing_status === "cash" ? "cash buyer" : null;
  const summary = `${name} liked your ${car.title}. They're ${budget}${credit ? `, ${credit}` : ""}${financing ? ` (${financing})` : ""}, with ${tradeText}, and plan to buy ${timeline}.${d.ai_summary ? ` ${d.ai_summary}` : ""}`;
  const firstReply = `Hi ${d.first_name ?? "there"}, thanks for your interest in the ${car.title}! It's available. Here's our out-the-door price with everything itemized, and I'm happy to set up a test drive.`;
  return { summary, firstReply };
}

const LeadSchema = z.object({ summary: z.string(), first_reply: z.string() });

export async function aiLeadSummary(
  d: LeadDossier,
  car: { title: string; price: number },
  usage: AiJsonOptions<typeof LeadSchema>["usage"],
): Promise<{ summary: string; firstReply: string; source: "ai" | "template" }> {
  const res = await aiJson({
    feature: "lead_summary",
    tier: "fast",
    maxTokens: 800,
    system: `Summarize a car buyer's intent for a dealer in one short paragraph (under 60 words), then suggest a friendly first reply (under 45 words) that invites an itemized out-the-door offer. Use only the dossier. Never include or ask for contact details. No emoji.`,
    schema: LeadSchema,
    usage,
    messages: [{ role: "user", content: `Car: ${car.title}, listed ${usd(car.price)}\nDossier: ${JSON.stringify(d)}` }],
  });
  if (!res) return { ...templateLeadSummary(d, car), source: "template" };
  return { summary: res.data.summary, firstReply: res.data.first_reply, source: "ai" };
}

const ProfileSchema = z.object({ summary: z.string() });

export async function aiProfileSummary(prefs: Prefs, facts: string[], usage: AiJsonOptions<typeof ProfileSchema>["usage"]): Promise<string> {
  const fallback = templateProfileSummary(prefs);
  const res = await aiJson({
    feature: "profile_summary",
    tier: "fast",
    maxTokens: 400,
    system: `Write one plain-English sentence (under 35 words) describing the car this buyer wants, like: "A 3-row SUV under $450/mo, AWD for the lake house, room for two car seats, leaning toward rugged styles." Use only the given preferences. No emoji.`,
    schema: ProfileSchema,
    usage,
    messages: [{ role: "user", content: `Preferences: ${JSON.stringify(Object.fromEntries(Object.entries(prefs).map(([k, p]) => [k, { value: p.value, tier: p.tier }])))}\nLife facts: ${facts.join("; ") || "none"}\nDraft: ${fallback}` }],
  });
  return res?.data.summary?.trim() || fallback;
}
