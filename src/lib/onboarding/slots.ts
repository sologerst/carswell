// Conversational onboarding: 10-15 answers in under 3 minutes. The AI opens
// with one question, extracts what it can, then asks only for gaps in this
// order. The form fallback asks the same questions as screens.

import { BODY_STYLES, type Prefs } from "../types";

export type SlotId =
  | "budget" | "location" | "condition" | "body" | "seats" | "fuel" | "history" | "trade" | "timeline" | "taste";

export interface Chip {
  label: string;
  value: string;
  /** Body-style chips render a car silhouette. */
  body?: string;
}

export interface Slot {
  id: SlotId;
  question: string;
  chips: Chip[];
  multi?: boolean;
  input?: "zip" | "money";
}

export const OPENING_QUESTION = "Tell me about your life and how you'll use this car.";
export const OPENING_HINT = "Kids? Dog? Long commute? Lake weekends? Budget? The more you share, the fewer questions I'll ask.";

export const SLOTS: Slot[] = [
  {
    id: "budget",
    question: "What budget feels comfortable?",
    chips: [
      { label: "$350/mo", value: "monthly:350" },
      { label: "$450/mo", value: "monthly:450" },
      { label: "$550/mo", value: "monthly:550" },
      { label: "$700/mo", value: "monthly:700" },
      { label: "Cash, $15k", value: "cash:15000" },
      { label: "Cash, $25k", value: "cash:25000" },
      { label: "Cash, $35k", value: "cash:35000" },
      { label: "Cash, $50k", value: "cash:50000" },
    ],
  },
  {
    id: "location",
    question: "What's your ZIP, and how far will you drive to see a car?",
    input: "zip",
    chips: [
      { label: "10 mi", value: "10" },
      { label: "25 mi", value: "25" },
      { label: "40 mi", value: "40" },
      { label: "75 mi", value: "75" },
    ],
  },
  {
    id: "condition",
    question: "New, used, or either?",
    chips: [
      { label: "Used", value: "used,cpo" },
      { label: "New", value: "new" },
      { label: "Either", value: "new,used,cpo" },
      { label: "Certified only", value: "cpo" },
    ],
  },
  {
    id: "body",
    question: "Which shapes are you open to? Pick any.",
    multi: true,
    chips: BODY_STYLES.slice(0, 8).map((b) => ({ label: b.label, value: b.key, body: b.key })),
  },
  {
    id: "seats",
    question: "How many seats do you need, at minimum?",
    chips: [
      { label: "2-4", value: "4" },
      { label: "5", value: "5" },
      { label: "7", value: "7" },
      { label: "8", value: "8" },
    ],
  },
  {
    id: "fuel",
    question: "Any fuel preference?",
    multi: true,
    chips: [
      { label: "Gas", value: "gas" },
      { label: "Hybrid", value: "hybrid" },
      { label: "Plug-in hybrid", value: "plugin_hybrid" },
      { label: "Electric", value: "electric" },
      { label: "No preference", value: "any" },
    ],
  },
  {
    id: "history",
    question: "Any history dealbreakers?",
    chips: [
      { label: "Clean title only", value: "title" },
      { label: "No accidents", value: "accidents" },
      { label: "Both", value: "both" },
      { label: "Doesn't matter", value: "none" },
    ],
  },
  {
    id: "trade",
    question: "Are you trading in a car?",
    chips: [
      { label: "Yes", value: "yes" },
      { label: "No", value: "no" },
    ],
  },
  {
    id: "timeline",
    question: "When are you hoping to buy?",
    chips: [
      { label: "This week", value: "week" },
      { label: "This month", value: "month" },
      { label: "1-3 months", value: "quarter" },
      { label: "Just browsing", value: "browsing" },
    ],
  },
  {
    id: "taste",
    question: "Last one: which looks better? Three quick picks.",
    chips: [],
  },
];

export const SLOT_BY_ID = Object.fromEntries(SLOTS.map((s) => [s.id, s])) as Record<SlotId, Slot>;

export interface OnboardingState {
  prefs: Prefs;
  zip: string | null;
  radiusSet: boolean;
  tasteDone: boolean;
  answered: SlotId[];
}

/** Has this slot been answered (explicitly or inferred from the life story)? */
export function slotFilled(id: SlotId, s: OnboardingState): boolean {
  if (s.answered.includes(id)) return true;
  const p = s.prefs;
  switch (id) {
    case "budget":
      return Boolean(p.max_monthly_payment?.value || p.max_cash_price?.value);
    case "location":
      return Boolean(s.zip) && s.radiusSet;
    case "condition":
      return Boolean(p.condition);
    case "body":
      return Boolean(p.body_styles);
    case "seats":
      return Boolean(p.min_seats);
    case "fuel":
      return Boolean(p.fuel_types);
    case "history":
      return Boolean(p.clean_title || p.no_accidents);
    case "trade":
      return Boolean(p.trade_in);
    case "timeline":
      return Boolean(p.timeline);
    case "taste":
      return s.tasteDone;
  }
}

export function nextSlot(s: OnboardingState): Slot | null {
  return SLOTS.find((slot) => !slotFilled(slot.id, s)) ?? null;
}

export function progress(s: OnboardingState): number {
  const done = SLOTS.filter((slot) => slotFilled(slot.id, s)).length;
  return done / SLOTS.length;
}
