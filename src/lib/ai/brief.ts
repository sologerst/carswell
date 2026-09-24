import "server-only";

import { z } from "zod";
import type { AppConfig } from "../config";
import { briefCost, costLine, sanitizeClaims, templateBrief, ALLOWED_SOURCES, type CarBrief } from "../brief/template";
import { featureLabel } from "../criteria/features";
import { CRITERION_BY_KEY, TIER_LABEL } from "../criteria/catalog";
import { marketDeltaText } from "../deal";
import type { DeckCandidate, Prefs } from "../types";
import { aiJson, type AiJsonOptions } from "./client";

const Claim = z.object({ text: z.string(), source: z.string() });
const BriefSchema = z.object({
  fits: z.array(Claim).describe("Exactly 3 reasons this car fits this buyer, most important first."),
  watch_outs: z.array(Claim).describe("Up to 3 honest things to watch out for. Empty if nothing real."),
});

const SYSTEM = `You write CarSwipe "Car Briefs": what a great car-buying friend would say about one listing for one buyer.
Rules:
- Use ONLY the facts provided. Never invent features, history, reliability ratings or specs. If a fact isn't listed, don't claim it.
- Every claim cites the field it comes from in "source", using one of: ${[...ALLOWED_SOURCES].join(", ")}.
- "fits": 3 short reasons tied to what this buyer wants (their life, must-haves, budget). Under 12 words each.
- "watch_outs": up to 3 real concerns (accidents, title, recalls, mileage wear items, days on market as negotiation room, price above market, missing history). Under 14 words each. No filler.
- Plain English, no hype, no emoji, no exclamation marks. Don't mention the buyer's protected traits.`;

function facts(car: DeckCandidate, prefs: Prefs): string {
  const lines: string[] = [];
  const add = (k: string, v: unknown) => {
    if (v !== null && v !== undefined && v !== "") lines.push(`${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`);
  };
  add("year", car.year);
  add("make", car.make);
  add("model", car.model);
  add("trim_level", car.trim_level);
  add("condition", car.condition);
  add("price", `$${car.price}`);
  add("expected_price", car.expected_price ? `$${car.expected_price}` : null);
  add("market", marketDeltaText(car.price, car.expected_price));
  add("deal_rating", car.deal_rating);
  add("miles", car.miles);
  add("body_style", car.body_style);
  add("drivetrain", car.drivetrain);
  add("fuel_type", car.fuel_type);
  add("mpg", car.mpg_city && car.mpg_hwy ? `${car.mpg_city} city / ${car.mpg_hwy} hwy` : null);
  add("ev_range_mi", car.ev_range_mi);
  add("seats", car.seats);
  add("third_row", car.third_row);
  add("towing_lbs", car.towing_lbs);
  add("features", car.features.map(featureLabel));
  add("features_verified", car.features_verified ? "yes (from build data)" : "no (dealer-listed, unconfirmed)");
  add("title_status", car.title_status ?? "not reported");
  add("accident_count", car.accident_count ?? "not reported");
  add("owner_count", car.owner_count ?? "not reported");
  add("personal_use", car.personal_use === false ? "no (rental or fleet)" : car.personal_use ? "yes" : "not reported");
  add("open_recalls", car.open_recalls);
  add("days_on_market", car.days_on_market);
  add("last_price_drop", car.last_price_drop ? `$${car.last_price_drop}` : null);
  add("distance_mi", Math.round(car.distance_mi));
  add("dealer", car.dealer_name);

  const wants = Object.entries(prefs)
    .filter(([, p]) => p.tier !== "dont_care" && p.value !== false && p.value !== null)
    .slice(0, 40)
    .map(([k, p]) => `- ${CRITERION_BY_KEY[k]?.label ?? k}: ${JSON.stringify(p.value)} (${TIER_LABEL[p.tier]})`);
  return `LISTING\n${lines.join("\n")}\n\nBUYER WANTS (profile)\n${wants.join("\n") || "- nothing stated yet"}`;
}

export async function aiBrief(
  car: DeckCandidate,
  prefs: Prefs,
  cfg: AppConfig,
  usage: AiJsonOptions<typeof BriefSchema>["usage"],
): Promise<CarBrief & { model?: string }> {
  const res = await aiJson({
    feature: "brief",
    tier: "frontier",
    effort: "low",
    maxTokens: 2500,
    system: SYSTEM,
    schema: BriefSchema,
    usage,
    messages: [{ role: "user", content: facts(car, prefs) }],
  });
  const fallback = templateBrief(car, prefs, cfg);
  if (!res) return fallback;
  const fits = sanitizeClaims(res.data.fits, 3);
  const watchOuts = sanitizeClaims(res.data.watch_outs, 3);
  if (fits.length === 0) return fallback;
  const cost = briefCost(car, prefs, cfg);
  return { fits, watchOuts, costToOwn: cost, costLine: costLine(cost), generatedBy: "ai", model: res.model };
}
