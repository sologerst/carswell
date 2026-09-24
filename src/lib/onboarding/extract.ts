// Rule-based extraction: the no-AI fallback for conversational onboarding, and
// the deterministic handler for tapped chips. The AI path returns the same
// Extraction shape (see src/lib/ai/onboarding.ts).

import { defaultTierFor, MAKES } from "../criteria/catalog";
import { extractFeaturesFromText, FEATURE_BY_KEY } from "../criteria/features";
import type { PrefSource, Tier } from "../types";
import type { SlotId } from "./slots";

export interface ExtractedPref {
  value: unknown;
  tier: Tier;
  source: PrefSource;
}

export interface Extraction {
  prefs: Record<string, ExtractedPref>;
  profile: { zip?: string; radius_mi?: number; first_name?: string };
  /** Plain-English life facts the AI (or rules) picked up. */
  facts: string[];
}

const empty = (): Extraction => ({ prefs: {}, profile: {}, facts: [] });

const WORD_NUMBERS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, a: 1, an: 1 };

function parseMoney(raw: string): number | null {
  const s = raw.replace(/[$,\s]/g, "").toLowerCase();
  const m = /^(\d+(?:\.\d+)?)(k)?$/.exec(s);
  if (!m) return null;
  const n = Number(m[1]) * (m[2] ? 1000 : 1);
  return Number.isFinite(n) ? n : null;
}

/** Extract preferences from free text. source = "life" for the opening story. */
export function extractFromText(text: string, source: PrefSource = "said"): Extraction {
  const out = empty();
  const t = ` ${text.toLowerCase()} `;
  const set = (key: string, value: unknown, tier: Tier = defaultTierFor(key)) => {
    if (!(key in out.prefs)) out.prefs[key] = { value, tier, source };
  };
  const addList = (key: string, values: string[], tier: Tier = defaultTierFor(key)) => {
    const existing = (out.prefs[key]?.value as string[] | undefined) ?? [];
    out.prefs[key] = { value: [...new Set([...existing, ...values])], tier: out.prefs[key]?.tier ?? tier, source };
  };

  // Name
  const name = /\b(?:[Ii]'?m|[Ii] am|[Mm]y name is|[Tt]his is)\s+([A-Z][a-z]{1,20})\b/.exec(text);
  if (name && !["Looking", "Trying", "Going", "Hoping", "Not", "Just", "In", "A", "An", "The", "So", "Pretty", "Really", "From", "Buying", "Shopping"].includes(name[1])) {
    out.profile.first_name = name[1];
  }

  // Budget
  const monthly = /\$?\s?(\d{3,4})\s*(?:\/\s*mo(?:nth)?\b|a month|per month|monthly|\/month|month\b)/i.exec(text);
  if (monthly) {
    set("budget_mode", "monthly");
    set("max_monthly_payment", Number(monthly[1]));
  } else {
    const cash = /(?:under|below|max(?:imum)?|up to|budget(?: of| is)?|around|about|spend|no more than|cash)\s*(?:of\s*)?\$?\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?\s?k)\b/i.exec(text)
      ?? /\$\s?(\d{1,3}(?:,\d{3})+|\d{2,3}\s?k)\b/i.exec(text);
    const amount = cash ? parseMoney(cash[1]) : null;
    if (amount && amount >= 2000 && amount <= 250000) {
      set("budget_mode", "cash");
      set("max_cash_price", amount);
    }
  }
  const down = /\$?\s?(\d[\d,]*(?:\.\d+)?\s?k?)\s*(?:down|as a down payment|for a down payment)/i.exec(text);
  if (down) {
    const amount = parseMoney(down[1]);
    if (amount !== null && amount < 100000) set("down_payment", amount);
  }

  // Credit
  if (/\b(excellent|great|perfect|8\d\d) credit\b|credit (score )?(is )?(excellent|great)/.test(t)) set("credit_tier", "excellent");
  else if (/\bgood credit\b|credit (is )?good\b/.test(t)) set("credit_tier", "good");
  else if (/\b(fair|ok(ay)?|average|decent) credit\b/.test(t)) set("credit_tier", "fair");
  else if (/\b(bad|poor|rebuilding|no|low|rough) credit\b|credit (is )?(bad|poor|rough)/.test(t)) set("credit_tier", "rebuilding");
  if (/\bpre-?approved\b/.test(t)) set("financing_status", "preapproved");
  else if (/\b(paying|pay) (in )?cash\b/.test(t)) set("financing_status", "cash");

  // Location
  const zip = /(?<![$\d])\b(\d{5})\b(?!\s*(?:miles|mi\b|\/mo|k\b))/.exec(text);
  if (zip) out.profile.zip = zip[1];
  const radius = /(\d{1,3})\s*(?:mi|miles)\b(?!\s*(?:on|a day|each way|round trip|commute))/i.exec(text);
  if (radius && /\b(drive|radius|away|within|from me|travel)\b/i.test(text)) out.profile.radius_mi = Number(radius[1]);

  // Condition
  const wantsNew = /\b(brand[- ]new|new car|a new one|buy new)\b/.test(t);
  const wantsUsed = /\b(used|pre-?owned|second[- ]hand)\b/.test(t);
  const wantsCpo = /\b(certified|cpo)\b/.test(t);
  if (wantsNew || wantsUsed || wantsCpo) {
    const conds = [...(wantsNew ? ["new"] : []), ...(wantsUsed ? ["used", "cpo"] : []), ...(wantsCpo ? ["cpo"] : [])];
    addList("condition", [...new Set(conds)]);
  }

  // Body styles
  const bodies: string[] = [];
  if (/\b(3|three)[- ]row|third row|7[- ]seat(er)?|8[- ]seat(er)?\b/.test(t)) bodies.push("three_row_suv");
  if (/\b(suv|crossover)s?\b/.test(t) && !bodies.includes("three_row_suv")) bodies.push("compact_suv", "midsize_suv");
  if (/\b(truck|pickup|pick-up)s?\b/.test(t)) bodies.push("pickup");
  if (/\bsedans?\b/.test(t)) bodies.push("sedan");
  if (/\b(minivan|mini-van|van)s?\b/.test(t)) bodies.push("minivan");
  if (/\bhatch(back)?s?\b/.test(t)) bodies.push("hatchback");
  if (/\bwagons?\b/.test(t)) bodies.push("wagon");
  if (/\b(coupe|sports car)s?\b/.test(t)) bodies.push("coupe");
  if (/\bconvertibles?\b/.test(t)) bodies.push("convertible");
  if (bodies.length) addList("body_styles", bodies);

  // Seats and kids
  const seats = /\b(\d)\s*(?:seats|seater|passengers?|people)\b/.exec(t);
  const kidsMatch = /\b(\d|one|two|three|four|five|a|an)\s+(?:(?:little|young|small|teenage)\s+)?(kids?|children|child|boys?|girls?|toddlers?|babies|baby)\b/.exec(t);
  const kids = kidsMatch ? (WORD_NUMBERS[kidsMatch[1]] ?? Number(kidsMatch[1])) : /\b(kids|children|my son|my daughter|family of)\b/.test(t) ? 2 : 0;
  if (seats) set("min_seats", Number(seats[1]));
  if (kids) {
    out.facts.push(kids === 1 ? "One kid" : `${kids} kids`);
    set("life_kids", String(kids), "nice");
    if (kids >= 3) {
      set("min_seats", 7);
      set("third_row", true, "nice");
    } else {
      set("min_seats", 5);
    }
    if (/\b(car seats?|booster|infant|toddler|baby|babies)\b/.test(t)) set("car_seats", Math.min(kids, 3), "nice");
    set("feature:auto_emergency_braking", true, "nice");
  }

  // Fuel
  const fuels: string[] = [];
  if (/\b(ev|electric|tesla|battery)\b/.test(t)) fuels.push("electric");
  if (/\bplug-?in\b/.test(t)) fuels.push("plugin_hybrid");
  if (/\bhybrid\b/.test(t)) fuels.push("hybrid");
  if (/\bdiesel\b/.test(t)) fuels.push("diesel");
  if (fuels.length) addList("fuel_types", fuels);
  if (/\b(no|not an?|hate|avoid) (ev|electric)/.test(t)) {
    out.prefs.fuel_types = { value: ["gas", "hybrid", "plugin_hybrid", "diesel"], tier: "must", source };
  }
  if (/\b(home charg|charge at home|garage charger|level 2)\b/.test(t)) set("home_charging", true, "nice");

  // Drivetrain
  if (/\b(awd|all[- ]wheel)\b/.test(t)) addList("drivetrains", ["awd"], "must");
  if (/\b(4wd|4x4|four[- ]wheel)\b/.test(t)) addList("drivetrains", ["4wd"], "must");

  // Life facts -> criteria (buyer confirms on the profile screen)
  if (/\b(commute|highway|interstate|i-?(24|40|65|440))\b/.test(t)) {
    out.facts.push("Long highway commute");
    set("life_commute", true, "nice");
    set("mpg_min", 30, "nice");
    set("feature:adaptive_cruise", true, "nice");
  }
  if (/\b(dogs?|puppy|pupp(y|ies)|lab|retriever|golden|shepherd|pets?)\b/.test(t)) {
    out.facts.push("Has a dog");
    set("life_dog", true, "nice");
    set("pet_friendly", true, "nice");
    set("cargo_space", "lots", "nice");
  }
  if (/\b(tow|towing|boat|trailer|camper|rv|horse trailer|jet ?skis?)\b/.test(t)) {
    out.facts.push("Tows a boat or trailer");
    set("life_towing", true, "nice");
    set("towing_min", /\b(camper|rv|horse)\b/.test(t) ? 7000 : 5000, "must");
    set("feature:tow_package", true, "nice");
  }
  if (/\b(lake|off-?road|gravel|dirt road|farm|trails?|mountains?|camping)\b/.test(t)) {
    out.facts.push("Lake or rough roads");
    set("life_offroad", true, "nice");
    if (!out.prefs.drivetrains) addList("drivetrains", ["awd", "4wd"], "nice");
    set("ground_clearance", "high", "nice");
  }
  if (/\b(snow|ice|icy|hills|hilly|winter)\b/.test(t)) {
    out.facts.push("Hills, ice or snow");
    set("life_weather", true, "nice");
    if (!out.prefs.drivetrains) addList("drivetrains", ["awd"], "nice");
    set("feature:heated_seats", true, "nice");
  }
  if (/\b(street parking|parallel park|tight garage|small garage|downtown parking)\b/.test(t)) {
    out.facts.push("Tight parking");
    set("life_parking", true, "nice");
    set("feature:camera_360", true, "nice");
  }
  if (/\b(uber|lyft|rideshare|ride-share|doordash|delivery driver)\b/.test(t)) {
    out.facts.push("Rideshare driver");
    set("life_rideshare", true, "nice");
    set("mpg_min", 30, "nice");
    set("min_seats", 5);
  }
  if (/\b(first car|teen|teenager|16[- ]year[- ]old|new driver|student driver)\b/.test(t)) {
    out.facts.push("First car or teen driver");
    set("life_first_car", true, "nice");
    set("feature:auto_emergency_braking", true, "must");
    set("horsepower_band", "modest", "nice");
  }
  if (/\b(wheelchair|mobility|bad (back|knees|hip)|hard to get in|elderly|my (mom|dad|parents))\b/.test(t)) {
    out.facts.push("Easy entry matters");
    set("life_accessibility", "easy entry", "nice");
    set("easy_entry", true, "nice");
  }

  // History
  if (/\bclean title\b/.test(t)) set("clean_title", true, "dealbreaker");
  if (/\b(no accidents?|accident[- ]free|never been in an accident|no wrecks?)\b/.test(t)) set("no_accidents", true, "dealbreaker");

  // Trade-in
  if (/\b(no trade|not trading|nothing to trade|don'?t have a trade)\b/.test(t)) set("trade_in", { has: false });
  else if (/\btrad(e|ing)[- ]?(it )?in\b|\btrade (in )?my\b|\bmy trade\b/.test(t)) {
    const value = /trade[^.$]{0,40}(?:worth|value|about|around)?\s*\$\s?(\d[\d,]*(?:\.\d+)?\s?k?)/i.exec(text);
    const payoff = /(?:owe|payoff|pay-?off)\s*(?:about|around)?\s*\$?\s?(\d[\d,]*(?:\.\d+)?\s?k?)/i.exec(text);
    const car = /trad(?:e|ing)[- ]?in (?:my |a |our )?((?:19|20)\d{2} [A-Za-z-]+(?: [A-Za-z0-9-]+)?)/i.exec(text);
    set("trade_in", {
      has: true,
      value: value ? parseMoney(value[1]) ?? undefined : undefined,
      payoff: payoff ? parseMoney(payoff[1]) ?? undefined : undefined,
      description: car?.[1],
    });
  }

  // Timeline
  if (/\b(this week|asap|right away|immediately|today|this weekend)\b/.test(t)) set("timeline", "week");
  else if (/\b(this month|next few weeks|couple (of )?weeks|in a few weeks)\b/.test(t)) set("timeline", "month");
  else if (/\b((1|2|3|one|two|three|few|couple( of)?) months?|this (summer|fall|spring|winter)|by (the )?(end of the year|christmas))\b/.test(t)) set("timeline", "quarter");
  else if (/\b(just (looking|browsing)|no rush|not in a hurry|someday)\b/.test(t)) set("timeline", "browsing");

  // Makes
  const liked: string[] = [];
  const excluded: string[] = [];
  for (const make of MAKES) {
    const m = make.toLowerCase().replace("-", "[- ]?");
    const re = new RegExp(`\\b${m}s?\\b`);
    if (!re.test(t)) continue;
    if (new RegExp(`\\b(no|not an?|never|hate|avoid|anything but|except)\\s+(an?\\s+)?${m}`).test(t)) excluded.push(make);
    else liked.push(make);
  }
  if (liked.length) addList("makes", liked, "nice");
  if (excluded.length) addList("brands_exclude", excluded, "dealbreaker");

  // Colors
  const colorWords: Record<string, string> = {
    white: "white", black: "black", gray: "gray", grey: "gray", silver: "silver", blue: "blue", red: "red",
    green: "green", brown: "brown", beige: "brown", tan: "brown", orange: "orange",
  };
  for (const [word, family] of Object.entries(colorWords)) {
    if (new RegExp(`\\b(no|not|hate|avoid)\\s+${word}\\b`).test(t)) addList("colors_avoid", [family], "dealbreaker");
    else if (new RegExp(`\\b(love|like|want|prefer)\\s+(a\\s+)?${word}\\b`).test(t)) addList("colors", [family], "nice");
  }

  // Features
  for (const f of extractFeaturesFromText(text)) {
    const patterns = FEATURE_BY_KEY[f]?.patterns ?? [];
    const must = patterns.some((p) => new RegExp(`\\b(must|need|needs|have to have|required?|non-?negotiable)\\b[^.]{0,40}(${p.source})`, "i").test(text));
    set(`feature:${f}`, true, must ? "must" : "nice");
  }

  // Mileage / year
  const maxMiles = /(?:under|less than|below|max(?:imum)?)\s*(\d{2,3}(?:,\d{3})?|\d{2,3}k)\s*(?:miles|mi)\b/i.exec(text);
  if (maxMiles) {
    const m = parseMoney(maxMiles[1]);
    if (m) set("max_mileage", m < 1000 ? m * 1000 : m);
  }
  const yearMin = /(?:(?:20)(\d{2})\s*(?:or newer|and newer|or later|\+))|(?:newer than|after)\s*20(\d{2})/i.exec(text);
  if (yearMin) set("year_range", { min: 2000 + Number(yearMin[1] ?? yearMin[2]) });

  return out;
}

/** Deterministic handling of a tapped chip (or typed ZIP/amount) for a slot. */
export function extractFromChip(slot: SlotId, value: string): Extraction {
  const out = empty();
  const set = (key: string, v: unknown, tier: Tier = defaultTierFor(key)) => {
    out.prefs[key] = { value: v, tier, source: "said" };
  };
  switch (slot) {
    case "budget": {
      const [mode, amount] = value.split(":");
      set("budget_mode", mode === "cash" ? "cash" : "monthly");
      set(mode === "cash" ? "max_cash_price" : "max_monthly_payment", Number(amount));
      break;
    }
    case "location": {
      if (/^\d{5}$/.test(value)) out.profile.zip = value;
      else if (/^\d{1,3}$/.test(value)) out.profile.radius_mi = Number(value);
      break;
    }
    case "condition":
      set("condition", value.split(","));
      break;
    case "body":
      set("body_styles", value.split(",").filter(Boolean));
      break;
    case "seats":
      set("min_seats", Number(value));
      if (Number(value) >= 7) set("third_row", true, "must");
      break;
    case "fuel":
      if (value === "any" || value === "") set("fuel_types", ["gas", "hybrid", "plugin_hybrid", "electric", "diesel"], "dont_care");
      else set("fuel_types", value.split(","));
      break;
    case "history":
      if (value === "title" || value === "both") set("clean_title", true, "dealbreaker");
      if (value === "accidents" || value === "both") set("no_accidents", true, "dealbreaker");
      if (value === "none") {
        set("clean_title", false, "dont_care");
        set("no_accidents", false, "dont_care");
      }
      break;
    case "trade":
      set("trade_in", { has: value === "yes" });
      break;
    case "timeline":
      set("timeline", value, "nice");
      break;
    case "taste":
      break;
  }
  return out;
}

/** Merge b over a; list values merge, scalars from b win. */
export function mergeExtractions(a: Extraction, b: Extraction): Extraction {
  const prefs = { ...a.prefs };
  for (const [k, v] of Object.entries(b.prefs)) {
    const prev = prefs[k];
    if (prev && Array.isArray(prev.value) && Array.isArray(v.value) && k !== "fuel_types") {
      prefs[k] = { ...v, value: [...new Set([...(prev.value as unknown[]), ...(v.value as unknown[])])] };
    } else {
      prefs[k] = v;
    }
  }
  return { prefs, profile: { ...a.profile, ...b.profile }, facts: [...new Set([...a.facts, ...b.facts])] };
}
