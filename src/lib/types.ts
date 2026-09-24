// Shared domain types used by the server, the client and tests.

export type BodyStyle =
  | "sedan" | "hatchback" | "coupe" | "convertible" | "wagon"
  | "compact_suv" | "midsize_suv" | "three_row_suv" | "minivan" | "pickup";
export type FuelType = "gas" | "diesel" | "hybrid" | "plugin_hybrid" | "electric";
export type Drivetrain = "fwd" | "rwd" | "awd" | "4wd";
export type Condition = "new" | "used" | "cpo";
export type DealRating = "great" | "good" | "fair" | "high" | "overpriced";
export type SwipeAction = "pass" | "like" | "superlike";

/** How the deck uses a criterion. */
export type Tier = "dealbreaker" | "must" | "nice" | "dont_care";
/** Where a preference came from: you said / you swiped / you told me about your life. */
export type PrefSource = "said" | "swiped" | "life" | "default";

export interface Pref<T = unknown> {
  value: T;
  tier: Tier;
  source: PrefSource;
}
export type Prefs = Record<string, Pref>;

export interface TradeIn {
  has: boolean;
  value?: number;
  payoff?: number;
  description?: string;
}

export const BODY_STYLES: { key: BodyStyle; label: string }[] = [
  { key: "compact_suv", label: "Compact SUV" },
  { key: "midsize_suv", label: "Midsize SUV" },
  { key: "three_row_suv", label: "3-row SUV" },
  { key: "pickup", label: "Pickup truck" },
  { key: "sedan", label: "Sedan" },
  { key: "hatchback", label: "Hatchback" },
  { key: "minivan", label: "Minivan" },
  { key: "wagon", label: "Wagon" },
  { key: "coupe", label: "Coupe" },
  { key: "convertible", label: "Convertible" },
];
export const BODY_LABEL: Record<BodyStyle, string> = Object.fromEntries(BODY_STYLES.map((b) => [b.key, b.label])) as Record<BodyStyle, string>;

export const FUEL_LABEL: Record<FuelType, string> = {
  gas: "Gas", diesel: "Diesel", hybrid: "Hybrid", plugin_hybrid: "Plug-in hybrid", electric: "Electric",
};
export const DRIVE_LABEL: Record<Drivetrain, string> = { fwd: "FWD", rwd: "RWD", awd: "AWD", "4wd": "4WD" };
export const CONDITION_LABEL: Record<Condition, string> = { new: "New", used: "Used", cpo: "Certified pre-owned" };

export const COLOR_FAMILIES: { key: string; label: string; hex: string }[] = [
  { key: "white", label: "White", hex: "#eef0f2" },
  { key: "black", label: "Black", hex: "#15171b" },
  { key: "gray", label: "Gray", hex: "#5d636b" },
  { key: "silver", label: "Silver", hex: "#b9bec5" },
  { key: "blue", label: "Blue", hex: "#2b4a7e" },
  { key: "red", label: "Red", hex: "#9e1b25" },
  { key: "green", label: "Green", hex: "#4f5a43" },
  { key: "brown", label: "Brown / beige", hex: "#8a7458" },
  { key: "orange", label: "Orange", hex: "#d2632b" },
];

/** A row returned by the deck_candidates() SQL function. */
export interface DeckCandidate {
  id: string;
  vin: string;
  year: number;
  make: string;
  model: string;
  trim_level: string | null;
  body_style: BodyStyle;
  condition: Condition;
  price: number;
  msrp: number | null;
  expected_price: number | null;
  deal_rating: DealRating | null;
  miles: number;
  exterior_color: string | null;
  exterior_color_family: string | null;
  interior_color: string | null;
  interior_material: string | null;
  fuel_type: FuelType;
  drivetrain: Drivetrain | null;
  transmission: string | null;
  engine: string | null;
  horsepower: number | null;
  mpg_city: number | null;
  mpg_hwy: number | null;
  ev_range_mi: number | null;
  seats: number | null;
  third_row: boolean | null;
  towing_lbs: number | null;
  features: string[];
  features_verified: boolean;
  title_status: string | null;
  accident_count: number | null;
  owner_count: number | null;
  personal_use: boolean | null;
  open_recalls: number | null;
  days_on_market: number;
  last_price_drop: number | null;
  photos: string[];
  photo_count: number;
  quality_score: number | null;
  seller_type: "dealer" | "private";
  source: string;
  source_url: string | null;
  zip: string | null;
  dealership_id: string | null;
  dealer_name: string | null;
  dealer_doc_fee: number | null;
  dealer_lead_channel: "inbox" | "email" | "none" | null;
  dealer_response_minutes: number | null;
  distance_mi: number;
  visual_sim: number | null;
  is_exploration: boolean;
}

export interface Affinity {
  attribute: string;
  likes: number;
  passes: number;
}

export interface MatchReason {
  key: string;
  text: string;
}

export interface Badge {
  kind: "not_confirmed" | "title_not_reported" | "history_not_reported" | "est" | "promoted";
  text: string;
}

/** A ranked card as sent to the client. */
export interface DeckCard {
  listing: DeckCandidate;
  score: number;
  reasons: MatchReason[];
  badges: Badge[];
  otdEstimate: number;
  monthlyEstimate: number;
  /** True when the buyer's trade-in equity is already subtracted from the OTD estimate. */
  afterTrade: boolean;
  exploration: boolean;
}

export interface ListingSummary {
  id: string;
  year: number;
  make: string;
  model: string;
  trim_level: string | null;
  price: number;
  miles: number;
  photo: string | null;
  dealer_name: string | null;
}

export function listingTitle(l: { year: number; make: string; model: string; trim_level?: string | null }, withTrim = false): string {
  return `${l.year} ${l.make} ${l.model}${withTrim && l.trim_level ? ` ${l.trim_level}` : ""}`;
}
