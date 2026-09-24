import "server-only";

import { z } from "zod";
import { defaultTierFor } from "../criteria/catalog";
import { FEATURE_KEYS } from "../criteria/features";
import type { Extraction, ExtractedPref } from "../onboarding/extract";
import type { PrefSource, Tier } from "../types";
import { aiJson, type AiJsonOptions } from "./client";

const LIFE_KEYS = [
  "life_commute", "life_kids", "life_dog", "life_towing", "life_offroad", "life_weather",
  "life_parking", "life_rideshare", "life_first_car", "life_accessibility",
] as const;

const n = <T extends z.ZodType>(t: T) => t.nullable();

const ExtractionSchema = z.object({
  acknowledgement: z.string().describe("One short, warm sentence reflecting back what they told you. No question."),
  first_name: n(z.string()),
  zip: n(z.string().describe("5-digit US ZIP")),
  radius_mi: n(z.number()),
  budget_mode: n(z.enum(["monthly", "cash"])),
  max_monthly_payment: n(z.number()),
  max_cash_price: n(z.number()),
  down_payment: n(z.number()),
  credit_tier: n(z.enum(["excellent", "good", "fair", "rebuilding"])),
  financing_status: n(z.enum(["preapproved", "needs", "cash"])),
  condition: n(z.array(z.enum(["new", "used", "cpo"]))),
  body_styles: n(z.array(z.enum(["sedan", "hatchback", "coupe", "convertible", "wagon", "compact_suv", "midsize_suv", "three_row_suv", "minivan", "pickup"]))),
  min_seats: n(z.number()),
  third_row: n(z.boolean()),
  fuel_types: n(z.array(z.enum(["gas", "hybrid", "plugin_hybrid", "electric", "diesel"]))),
  drivetrains: n(z.array(z.enum(["fwd", "rwd", "awd", "4wd"]))),
  makes: n(z.array(z.string())),
  brands_exclude: n(z.array(z.string())),
  colors: n(z.array(z.string())),
  colors_avoid: n(z.array(z.string())),
  clean_title: n(z.boolean()),
  no_accidents: n(z.boolean()),
  trade_in: n(z.object({ has: z.boolean(), value: n(z.number()), payoff: n(z.number()), description: n(z.string()) })),
  timeline: n(z.enum(["week", "month", "quarter", "browsing"])),
  towing_min: n(z.number()),
  mpg_min: n(z.number()),
  max_mileage: n(z.number()),
  year_min: n(z.number()),
  must_have_features: z.array(z.string()).describe(`Canonical feature keys the buyer called essential. Allowed: ${FEATURE_KEYS.join(", ")}`),
  nice_features: z.array(z.string()).describe("Canonical feature keys that would be nice, including ones implied by their life (e.g. a dog -> washable_interior)."),
  life_facts: z.array(z.object({ key: z.enum(LIFE_KEYS), fact: z.string() })),
});

const SYSTEM = `You are CarSwipe's onboarding assistant: a friendly, sharp car-buying friend in Nashville.
Read what the buyer wrote and extract only what they actually said or clearly implied. Leave anything else null (or an empty list).
Translate life facts into car needs: kids -> seats and safety; a dog -> cargo room, washable interior; towing -> towing capacity and a tow package; lake or rough roads -> AWD/4WD; hills or ice -> AWD, heated seats; long highway commute -> fuel economy, adaptive cruise; tight parking -> 360 camera; first car or teen -> safety features.
Never infer or mention protected traits (race, religion, national origin, sex, age beyond "teen driver", disability beyond what they volunteer, marital status). Never guess a ZIP or budget.
Budget: "$450/mo" is monthly; a lump sum like "under 30k" is cash. Keep the acknowledgement to one sentence, plain English, no emoji, no question.`;

export interface AiOnboardingResult {
  acknowledgement: string;
  extraction: Extraction;
}

export async function aiExtractOnboarding(
  text: string,
  context: { alreadyKnown: string; source: PrefSource },
  usage: AiJsonOptions<typeof ExtractionSchema>["usage"],
): Promise<AiOnboardingResult | null> {
  const res = await aiJson({
    feature: "onboarding",
    tier: "frontier",
    effort: "low",
    maxTokens: 3000,
    system: SYSTEM,
    schema: ExtractionSchema,
    usage,
    messages: [{
      role: "user",
      content: `What we already know about this buyer:\n${context.alreadyKnown || "(nothing yet)"}\n\nTheir latest message:\n"""${text.slice(0, 4000)}"""`,
    }],
  });
  if (!res) return null;
  return { acknowledgement: res.data.acknowledgement, extraction: toExtraction(res.data, context.source) };
}

function toExtraction(d: z.infer<typeof ExtractionSchema>, source: PrefSource): Extraction {
  const prefs: Record<string, ExtractedPref> = {};
  const set = (key: string, value: unknown, tier: Tier = defaultTierFor(key)) => {
    if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) return;
    prefs[key] = { value, tier, source };
  };
  set("budget_mode", d.budget_mode);
  set("max_monthly_payment", d.max_monthly_payment);
  set("max_cash_price", d.max_cash_price);
  set("down_payment", d.down_payment);
  set("credit_tier", d.credit_tier);
  set("financing_status", d.financing_status);
  set("condition", d.condition);
  set("body_styles", d.body_styles);
  set("min_seats", d.min_seats);
  set("third_row", d.third_row, "nice");
  set("fuel_types", d.fuel_types);
  set("drivetrains", d.drivetrains, "nice");
  set("makes", d.makes, "nice");
  set("brands_exclude", d.brands_exclude);
  set("colors", d.colors, "nice");
  set("colors_avoid", d.colors_avoid);
  if (d.clean_title) set("clean_title", true, "dealbreaker");
  if (d.no_accidents) set("no_accidents", true, "dealbreaker");
  if (d.trade_in) {
    set("trade_in", {
      has: d.trade_in.has,
      value: d.trade_in.value ?? undefined,
      payoff: d.trade_in.payoff ?? undefined,
      description: d.trade_in.description ?? undefined,
    });
  }
  set("timeline", d.timeline, "nice");
  set("towing_min", d.towing_min, "must");
  set("mpg_min", d.mpg_min, "nice");
  set("max_mileage", d.max_mileage);
  if (d.year_min) set("year_range", { min: d.year_min });
  for (const f of d.must_have_features) if (FEATURE_KEYS.includes(f)) set(`feature:${f}`, true, "must");
  for (const f of d.nice_features) if (FEATURE_KEYS.includes(f) && !prefs[`feature:${f}`]) set(`feature:${f}`, true, "nice");
  for (const lf of d.life_facts) set(lf.key, lf.key === "life_kids" || lf.key === "life_accessibility" ? lf.fact : true, "nice");

  const profile: Extraction["profile"] = {};
  if (d.first_name) profile.first_name = d.first_name.slice(0, 40);
  if (d.zip && /^\d{5}$/.test(d.zip)) profile.zip = d.zip;
  if (d.radius_mi && d.radius_mi > 0 && d.radius_mi <= 500) profile.radius_mi = Math.round(d.radius_mi);
  return { prefs, profile, facts: d.life_facts.map((f) => f.fact) };
}
