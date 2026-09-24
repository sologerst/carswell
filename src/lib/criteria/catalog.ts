// The buyer criteria system: ~120 criteria in 12 categories. Buyers answer
// 10-15 up front; the AI infers the rest from conversation and swipes, then
// shows its guesses as editable chips.

import { BODY_STYLES, COLOR_FAMILIES, type Tier } from "../types";
import { FEATURES, FEATURE_GROUP_LABELS } from "./features";

export type CriterionType = "H" | "S" | "D";
export type LearnedBy = "ask" | "ai" | "swipe" | "later";
export type DataSource = "MC" | "VIN" | "NHTSA" | "AIx" | "Calc" | "3P" | "User" | "Internal";

export type CategoryKey =
  | "money" | "car" | "powertrain" | "size" | "features" | "look"
  | "history" | "value" | "seller" | "lifestyle" | "values" | "timing";

export const CATEGORIES: { key: CategoryKey; label: string }[] = [
  { key: "money", label: "Money" },
  { key: "car", label: "The car itself" },
  { key: "powertrain", label: "Powertrain and performance" },
  { key: "size", label: "Size and practicality" },
  { key: "features", label: "Features" },
  { key: "look", label: "Look and feel" },
  { key: "history", label: "History and condition" },
  { key: "value", label: "Value and deal quality" },
  { key: "seller", label: "Seller and buying experience" },
  { key: "lifestyle", label: "Lifestyle" },
  { key: "values", label: "Values and exclusions" },
  { key: "timing", label: "Timing" },
];

export type ValueKind = "enum" | "multi" | "number" | "money" | "bool" | "range" | "text" | "trade" | "calc";

export interface Option {
  value: string;
  label: string;
}

export interface Criterion {
  key: string;
  label: string;
  category: CategoryKey;
  type: CriterionType;
  learnedBy: LearnedBy[];
  source: DataSource[];
  ifMissing: string;
  kind: ValueKind;
  options?: Option[];
  unit?: string;
  /** How the deck uses it today: hard filter, ranking signal, or stored only. */
  deckEffect: "filter" | "rank" | "stored";
  /** Only offered as a hard filter when listing data is reliable enough. */
  reliable?: boolean;
  example?: string;
}

const opts = (pairs: [string, string][]): Option[] => pairs.map(([value, label]) => ({ value, label }));

export const CREDIT_OPTIONS = opts([["excellent", "Excellent"], ["good", "Good"], ["fair", "Fair"], ["rebuilding", "Rebuilding"]]);
export const TIMELINE_OPTIONS = opts([["week", "This week"], ["month", "This month"], ["quarter", "1-3 months"], ["browsing", "Just browsing"]]);
export const CONDITION_OPTIONS = opts([["new", "New"], ["used", "Used"], ["cpo", "Certified pre-owned"]]);
export const FUEL_OPTIONS = opts([["gas", "Gas"], ["hybrid", "Hybrid"], ["plugin_hybrid", "Plug-in hybrid"], ["electric", "Electric"], ["diesel", "Diesel"]]);
export const DRIVE_OPTIONS = opts([["fwd", "FWD"], ["rwd", "RWD"], ["awd", "AWD"], ["4wd", "4WD"]]);
export const FINANCING_OPTIONS = opts([["preapproved", "Pre-approved"], ["needs", "Need financing"], ["cash", "Paying cash"]]);
export const MAKES = [
  "Acura", "Audi", "BMW", "Chevrolet", "Dodge", "Ford", "GMC", "Honda", "Hyundai", "Jeep", "Kia", "Lexus",
  "Mazda", "Mercedes-Benz", "Nissan", "Ram", "Subaru", "Tesla", "Toyota", "Volkswagen", "Volvo",
];

const c = (key: string, label: string, category: CategoryKey, type: CriterionType, learnedBy: LearnedBy[],
  source: DataSource[], ifMissing: string, kind: ValueKind, deckEffect: Criterion["deckEffect"], extra: Partial<Criterion> = {}): Criterion =>
  ({ key, label, category, type, learnedBy, source, ifMissing, kind, deckEffect, ...extra });

const CORE: Criterion[] = [
  // 1. Money
  c("budget_mode", "Budget mode", "money", "H", ["ask"], ["User"], "Required", "enum", "filter", { options: opts([["monthly", "Monthly payment"], ["cash", "Cash price"]]) }),
  c("max_cash_price", "Max cash price", "money", "H", ["ask"], ["User"], "Required in cash mode", "money", "filter", { example: "$28,000" }),
  c("max_monthly_payment", "Max monthly payment", "money", "H", ["ask"], ["User"], "Required in monthly mode", "money", "filter", { unit: "/mo", example: "$450/mo" }),
  c("down_payment", "Down payment", "money", "H", ["ask"], ["User"], "Assume $0", "money", "filter", { example: "$3,000" }),
  c("loan_term", "Loan term", "money", "H", ["ask"], ["User"], "Default 72 mo", "enum", "filter", { options: opts([["36", "36 mo"], ["48", "48 mo"], ["60", "60 mo"], ["72", "72 mo"], ["84", "84 mo"]]) }),
  c("credit_tier", "Credit", "money", "H", ["ask"], ["User"], "Default \"good\"", "enum", "filter", { options: CREDIT_OPTIONS }),
  c("trade_in", "Trade-in", "money", "H", ["ask", "ai"], ["User"], "No trade", "trade", "filter"),
  c("out_the_door", "Out-the-door price", "money", "H", [], ["Calc"], "Show \"Est.\" badge", "calc", "filter", { example: "Incl. TN tax, trade credit, title, fees" }),
  c("financing_status", "Financing", "money", "S", ["ask"], ["User"], "Unknown", "enum", "stored", { options: FINANCING_OPTIONS }),
  c("lease_or_buy", "Lease or buy", "money", "H", ["ask"], ["User"], "Buy", "enum", "stored", { options: opts([["buy", "Buy"], ["lease", "Lease"]]) }),
  c("cost_to_own", "Monthly cost to own", "money", "S", [], ["Calc", "3P"], "Hide line item", "calc", "stored"),
  c("budget_headroom", "Budget headroom", "money", "S", [], ["Calc"], "—", "calc", "rank"),
  // 2. The car itself
  c("condition", "New, used or CPO", "car", "H", ["ask"], ["MC"], "Treat as used", "multi", "filter", { options: CONDITION_OPTIONS, reliable: true }),
  c("year_range", "Year range", "car", "H", ["ask"], ["MC", "VIN"], "Exclude", "range", "filter", { reliable: true, example: "2019-2024" }),
  c("makes", "Makes", "car", "S", ["ask", "swipe"], ["MC", "VIN"], "—", "multi", "rank", { options: MAKES.map((m) => ({ value: m, label: m })), reliable: true }),
  c("models", "Models", "car", "S", ["ask", "swipe"], ["MC", "VIN"], "—", "multi", "rank", { example: "RAV4, CR-V" }),
  c("trims", "Trim", "car", "S", ["later"], ["MC", "VIN"], "Neutral", "multi", "stored"),
  c("body_styles", "Body style", "car", "H", ["ask"], ["MC", "VIN"], "Use VIN body class", "multi", "filter", { options: BODY_STYLES.map((b) => ({ value: b.key, label: b.label })), reliable: true }),
  c("body_styles_exclude", "Body styles to skip", "car", "D", ["swipe"], ["MC", "VIN"], "Use VIN body class", "multi", "filter", { options: BODY_STYLES.map((b) => ({ value: b.key, label: b.label })), reliable: true }),
  c("max_mileage", "Max mileage", "car", "H", ["ask"], ["MC"], "Exclude", "number", "filter", { unit: "mi", reliable: true, example: "60,000 mi" }),
  c("price_range", "Price range", "car", "H", [], ["Calc", "MC"], "Exclude", "calc", "filter"),
  // 3. Powertrain and performance
  c("fuel_types", "Fuel", "powertrain", "H", ["ask"], ["MC", "VIN"], "Use VIN", "multi", "filter", { options: FUEL_OPTIONS, reliable: true }),
  c("ev_range", "EV range", "powertrain", "H", ["later"], ["MC", "3P"], "\"Range not listed\"", "number", "filter", { unit: "mi", example: "250+ mi" }),
  c("home_charging", "Home charging", "powertrain", "S", ["ai"], ["User"], "Assume none", "bool", "stored"),
  c("fast_charging", "Fast-charging speed", "powertrain", "S", ["later"], ["3P"], "Neutral", "enum", "stored"),
  c("drivetrains", "Drivetrain", "powertrain", "H", ["ask", "ai"], ["MC", "VIN"], "Use VIN", "multi", "filter", { options: DRIVE_OPTIONS, reliable: true }),
  c("transmission", "Transmission", "powertrain", "H", ["later"], ["MC", "VIN"], "Assume automatic", "enum", "filter", { options: opts([["automatic", "Automatic"], ["manual", "Manual"]]), reliable: true }),
  c("engine", "Engine", "powertrain", "S", ["swipe"], ["MC", "VIN"], "Neutral", "text", "stored", { example: "V6" }),
  c("horsepower_band", "Horsepower", "powertrain", "S", ["later"], ["MC", "VIN"], "Neutral", "enum", "rank", { options: opts([["modest", "Under 200 hp"], ["mid", "200-300 hp"], ["strong", "300+ hp"]]) }),
  c("mpg_min", "Fuel economy", "powertrain", "S", ["ai"], ["MC", "3P"], "Neutral", "number", "rank", { unit: "mpg", example: "30+ mpg" }),
  c("towing_min", "Towing capacity", "powertrain", "H", ["ai"], ["3P", "AIx"], "\"Not confirmed\"", "number", "filter", { unit: "lb", example: "7,000 lb" }),
  c("payload", "Payload", "powertrain", "S", ["later"], ["3P"], "Neutral", "number", "stored", { unit: "lb" }),
  // 4. Size and practicality
  c("min_seats", "Minimum seats", "size", "H", ["ask", "ai"], ["VIN", "MC"], "Use body class", "number", "filter", { reliable: true, example: "7" }),
  c("third_row", "Third row", "size", "H", ["ai"], ["MC", "VIN", "AIx"], "\"Not confirmed\"", "bool", "filter", { reliable: true }),
  c("cargo_space", "Cargo space", "size", "S", ["later"], ["3P"], "Neutral", "enum", "rank", { options: opts([["some", "Some"], ["lots", "Lots"]]) }),
  c("car_seats", "Car seats that fit", "size", "S", ["ai"], ["3P"], "Neutral", "number", "rank", { example: "2" }),
  c("ground_clearance", "Ground clearance", "size", "S", ["ai"], ["3P"], "Neutral", "enum", "rank", { options: opts([["normal", "Normal"], ["high", "High"]]) }),
  c("max_length", "Fits my garage", "size", "H", ["later"], ["3P"], "\"Size not confirmed\"", "number", "rank", { unit: "in" }),
  c("easy_entry", "Easy entry", "size", "S", ["ai"], ["3P"], "Neutral", "bool", "rank"),
  c("pet_friendly", "Pet-friendly", "size", "S", ["ai"], ["AIx"], "Neutral", "bool", "rank"),
];

// 5. Features: one criterion per canonical feature key.
const FEATURE_CRITERIA: Criterion[] = FEATURES.map((f) =>
  c(`feature:${f.key}`, f.label, "features", f.group === "safety" || f.group === "utility" ? "S" : "S",
    f.group === "convenience" || f.group === "utility" ? ["later", "ai"] : ["ask", "swipe"],
    ["MC", "AIx", "VIN"], f.group === "safety" || f.group === "utility" ? "\"Not confirmed\" badge" : "Neutral",
    "bool", "filter", { example: FEATURE_GROUP_LABELS[f.group] }));

const REST: Criterion[] = [
  // 6. Look and feel
  c("colors", "Exterior color", "look", "S", ["ask", "swipe"], ["MC", "AIx"], "Detect from photo", "multi", "rank", { options: COLOR_FAMILIES.map((x) => ({ value: x.key, label: x.label })) }),
  c("interior_color", "Interior color", "look", "S", ["later", "swipe"], ["MC", "AIx"], "Neutral", "multi", "stored"),
  c("interior_material", "Interior material", "look", "S", ["swipe"], ["MC", "AIx"], "Neutral", "multi", "rank", { options: opts([["cloth", "Cloth"], ["leather", "Leather"], ["synthetic_leather", "Synthetic leather"]]) }),
  c("wheel_style", "Wheel style", "look", "S", ["swipe"], ["AIx"], "Neutral", "text", "stored"),
  c("visual_style", "Visual style", "look", "S", ["swipe"], ["AIx"], "Neutral", "multi", "rank", { options: opts([["boxy", "Boxy"], ["sporty", "Sporty"], ["rugged", "Rugged"], ["luxe", "Luxe"]]) }),
  c("colors_avoid", "Colors to avoid", "look", "D", ["ask"], ["MC", "AIx"], "Detect from photo", "multi", "filter", { options: COLOR_FAMILIES.map((x) => ({ value: x.key, label: x.label })), reliable: true }),
  // 7. History and condition
  c("clean_title", "Clean title only", "history", "D", ["ask"], ["MC", "3P"], "\"Title not reported\" badge", "bool", "filter", { reliable: true }),
  c("no_accidents", "No accidents", "history", "D", ["ask"], ["MC", "3P"], "\"History not reported\" badge; passes", "bool", "filter", { reliable: true }),
  c("max_owners", "Max owners", "history", "S", ["later"], ["MC", "3P"], "Neutral", "number", "filter", { reliable: true, example: "1" }),
  c("personal_use", "Personal use only", "history", "S", ["later"], ["MC", "3P"], "Neutral", "bool", "rank"),
  c("service_records", "Service records", "history", "S", ["later"], ["MC", "AIx"], "Neutral", "bool", "rank"),
  c("no_open_recalls", "No open recalls", "history", "S", ["later"], ["NHTSA"], "Check by VIN", "bool", "rank"),
  c("factory_warranty", "Factory warranty left", "history", "S", ["later"], ["Calc"], "Estimate", "bool", "rank"),
  c("cpo_warranty", "CPO warranty", "history", "S", ["later"], ["MC"], "Neutral", "bool", "rank"),
  c("days_on_market", "Days on market", "history", "S", [], ["MC"], "—", "calc", "rank"),
  c("price_drops", "Price drops", "history", "S", [], ["Calc"], "—", "calc", "rank"),
  // 8. Value and deal quality
  c("deal_rating", "Deal rating", "value", "S", ["later"], ["Calc"], "No badge", "enum", "rank", { options: opts([["great", "Great deals only"], ["good", "Good or better"], ["fair", "Fair or better"]]) }),
  c("reliability", "Reliability rating", "value", "S", ["ai"], ["3P"], "Neutral", "enum", "stored"),
  c("depreciation", "Expected depreciation", "value", "S", ["later"], ["3P"], "Hidden", "calc", "stored"),
  c("resale", "Resale strength", "value", "S", ["later"], ["Calc"], "Hidden", "calc", "stored"),
  // 9. Seller and buying experience
  c("seller_types", "Seller type", "seller", "H", ["ask"], ["MC", "Internal"], "—", "multi", "filter", { options: opts([["dealer", "Dealer"], ["private", "Private seller"]]), reliable: true }),
  c("search_radius", "Search radius", "seller", "H", ["ask"], ["Calc"], "Required", "number", "filter", { unit: "mi", example: "40 mi" }),
  c("seller_rating", "Seller rating", "seller", "S", ["later"], ["Internal"], "Neutral", "enum", "stored"),
  c("response_time", "Seller response time", "seller", "S", [], ["Internal"], "Neutral", "calc", "rank"),
  c("home_delivery", "Home delivery", "seller", "S", ["later"], ["MC", "AIx"], "Neutral", "bool", "stored"),
  c("at_home_test_drive", "At-home test drive", "seller", "S", ["later"], ["Internal"], "Neutral", "bool", "stored"),
  c("buy_online", "Buy online", "seller", "S", ["later"], ["Internal"], "Neutral", "bool", "stored"),
  c("accepts_trade_ins", "Accepts trade-ins", "seller", "S", ["ai"], ["Internal"], "Assume yes for dealers", "bool", "stored"),
  c("no_haggle", "No-haggle pricing", "seller", "S", ["later"], ["Internal"], "Neutral", "bool", "stored"),
  // 10. Lifestyle (AI-inferred, buyer confirms). Translated into the filters above.
  c("life_commute", "Long highway commute", "lifestyle", "S", ["ai"], ["User"], "—", "bool", "stored"),
  c("life_kids", "Kids", "lifestyle", "S", ["ai"], ["User"], "—", "text", "stored"),
  c("life_dog", "Dog", "lifestyle", "S", ["ai"], ["User"], "—", "bool", "stored"),
  c("life_towing", "Tows a boat or trailer", "lifestyle", "S", ["ai"], ["User"], "—", "bool", "stored"),
  c("life_offroad", "Off-road or lake roads", "lifestyle", "S", ["ai"], ["User"], "—", "bool", "stored"),
  c("life_weather", "Hills, ice, occasional snow", "lifestyle", "S", ["ai"], ["User"], "—", "bool", "stored"),
  c("life_parking", "Street parking or tight garage", "lifestyle", "S", ["ai"], ["User"], "—", "bool", "stored"),
  c("life_rideshare", "Rideshare driver", "lifestyle", "S", ["ai"], ["User"], "—", "bool", "stored"),
  c("life_first_car", "First car or teen driver", "lifestyle", "S", ["ai"], ["User"], "—", "bool", "stored"),
  c("life_accessibility", "Accessibility needs", "lifestyle", "S", ["ai"], ["User"], "—", "text", "stored"),
  // 11. Values and exclusions
  c("brands_exclude", "Brands to exclude", "values", "D", ["ask"], ["MC"], "—", "multi", "filter", { options: MAKES.map((m) => ({ value: m, label: m })), reliable: true }),
  c("country_of_origin", "Country of origin", "values", "S", ["later"], ["VIN"], "—", "multi", "stored"),
  c("eco_priority", "Eco priority", "values", "S", ["ai"], ["Calc"], "—", "bool", "rank"),
  // 12. Timing
  c("timeline", "Purchase timeline", "timing", "S", ["ask"], ["User"], "Browsing", "enum", "stored", { options: TIMELINE_OPTIONS }),
  c("test_drive_windows", "Test-drive windows", "timing", "S", ["later"], ["User"], "Asked at super-like", "text", "stored"),
];

export const CRITERIA: Criterion[] = [...CORE, ...FEATURE_CRITERIA, ...REST];
export const CRITERION_BY_KEY: Record<string, Criterion> = Object.fromEntries(CRITERIA.map((x) => [x.key, x]));

/** Free-text life story from onboarding; stored alongside the criteria. */
export const LIFE_STORY_KEY = "life_story";

export function defaultTierFor(key: string): Tier {
  const def = CRITERION_BY_KEY[key];
  if (!def) return "nice";
  return def.type === "D" ? "dealbreaker" : def.type === "H" ? "must" : "nice";
}

export const TIER_LABEL: Record<Tier, string> = {
  dealbreaker: "Dealbreaker",
  must: "Must-have",
  nice: "Nice-to-have",
  dont_care: "Don't care",
};

export const TIER_HELP: Record<Tier, string> = {
  dealbreaker: "Hard filter. The car never appears.",
  must: "Hard filter when the data is reliable; otherwise a big boost and a \"Not confirmed\" badge.",
  nice: "Ranking boost only.",
  dont_care: "Ignored.",
};

export const SOURCE_LABEL = {
  said: "You said",
  swiped: "You swiped",
  life: "You told me about your life",
  default: "Default",
} as const;
