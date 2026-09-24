// Empty-deck rescue: when fewer than 6 cars remain, find which single
// loosening unlocks the most cars and offer the top three as one-tap buttons.
// Dealbreakers are never offered for loosening.

import { featureLabel } from "../criteria/features";
import { BODY_LABEL, type BodyStyle, type Pref, type Prefs } from "../types";
import { isHard, isLockedTier } from "./filters";

export interface PrefPatch {
  key: string;
  /** null deletes the preference. */
  pref: Pref | null;
}

export interface Loosening {
  id: string;
  label: string;
  prefPatches: PrefPatch[];
  radiusMi?: number;
}

const NEIGHBOR_BODIES: Partial<Record<BodyStyle, BodyStyle[]>> = {
  compact_suv: ["midsize_suv", "wagon"],
  midsize_suv: ["compact_suv", "three_row_suv"],
  three_row_suv: ["midsize_suv", "minivan"],
  minivan: ["three_row_suv"],
  sedan: ["hatchback", "wagon"],
  hatchback: ["sedan", "compact_suv"],
  wagon: ["compact_suv", "hatchback"],
  pickup: ["midsize_suv"],
  coupe: ["convertible", "sedan"],
  convertible: ["coupe"],
};

const RADIUS_STEPS = [10, 25, 40, 60, 100, 150];

export function looseningOptions(prefs: Prefs, radiusMi: number): Loosening[] {
  const out: Loosening[] = [];
  const hardSoft = (key: string) => isHard(key, prefs[key]) && !isLockedTier(prefs[key]?.tier);
  const setPref = (key: string, value: unknown): PrefPatch => ({ key, pref: { ...prefs[key], value } });

  const nextRadius = RADIUS_STEPS.find((r) => r > radiusMi);
  if (nextRadius) out.push({ id: `radius:${nextRadius}`, label: `Widen to ${nextRadius} mi`, prefPatches: [], radiusMi: nextRadius });

  const budgetLocked = isLockedTier(prefs.max_monthly_payment?.tier) || isLockedTier(prefs.max_cash_price?.tier);
  if (!budgetLocked) {
    if (prefs.budget_mode?.value === "cash" && prefs.max_cash_price) {
      const raised = Math.ceil((Number(prefs.max_cash_price.value) * 1.07) / 500) * 500;
      out.push({ id: `cash:${raised}`, label: `Raise to $${raised.toLocaleString("en-US")}`, prefPatches: [setPref("max_cash_price", raised)] });
    } else if (prefs.max_monthly_payment) {
      const raised = Math.ceil((Number(prefs.max_monthly_payment.value) * 1.07) / 10) * 10;
      out.push({ id: `monthly:${raised}`, label: `Raise to $${raised}/mo`, prefPatches: [setPref("max_monthly_payment", raised)] });
    }
  }

  if (hardSoft("year_range")) {
    const r = prefs.year_range.value as { min?: number; max?: number };
    if (r.min) out.push({ id: `year:${r.min - 1}`, label: `Allow ${r.min - 1}`, prefPatches: [setPref("year_range", { ...r, min: r.min - 1 })] });
  }
  if (hardSoft("max_mileage")) {
    const m = Number(prefs.max_mileage.value) + 20_000;
    out.push({ id: `miles:${m}`, label: `Allow up to ${Math.round(m / 1000)}k mi`, prefPatches: [setPref("max_mileage", m)] });
  }
  if (hardSoft("body_styles")) {
    const current = (prefs.body_styles.value as BodyStyle[]) ?? [];
    const addition = current.flatMap((b) => NEIGHBOR_BODIES[b] ?? []).find((b) => !current.includes(b));
    if (addition) out.push({ id: `body:${addition}`, label: `Include ${BODY_LABEL[addition].toLowerCase()}s`, prefPatches: [setPref("body_styles", [...current, addition])] });
  }
  if (hardSoft("condition")) {
    const current = (prefs.condition.value as string[]) ?? [];
    const addition = ["cpo", "used", "new"].find((c) => !current.includes(c));
    if (addition) out.push({ id: `condition:${addition}`, label: addition === "cpo" ? "Include certified" : `Include ${addition}`, prefPatches: [setPref("condition", [...current, addition])] });
  }
  if (hardSoft("fuel_types")) {
    const current = (prefs.fuel_types.value as string[]) ?? [];
    const addition = ["hybrid", "plugin_hybrid", "gas"].find((c) => !current.includes(c));
    if (addition) out.push({ id: `fuel:${addition}`, label: `Include ${addition === "plugin_hybrid" ? "plug-in hybrids" : `${addition}`}`, prefPatches: [setPref("fuel_types", [...current, addition])] });
  }
  if (hardSoft("drivetrains")) {
    const current = (prefs.drivetrains.value as string[]) ?? [];
    const addition = ["awd", "4wd", "fwd", "rwd"].find((c) => !current.includes(c));
    if (addition) out.push({ id: `drive:${addition}`, label: `Allow ${addition.toUpperCase()}`, prefPatches: [setPref("drivetrains", [...current, addition])] });
  }
  if (hardSoft("min_seats") && Number(prefs.min_seats.value) > 5) {
    const seats = Number(prefs.min_seats.value) - 1;
    out.push({ id: `seats:${seats}`, label: `Allow ${seats} seats`, prefPatches: [setPref("min_seats", seats)] });
  }
  for (const [key, pref] of Object.entries(prefs)) {
    if (key.startsWith("feature:") && pref.tier === "must" && pref.value === true) {
      out.push({ id: `soften:${key}`, label: `Make ${featureLabel(key.slice(8))} a nice-to-have`, prefPatches: [{ key, pref: { ...pref, tier: "nice" } }] });
    }
  }
  return out;
}

/** Apply patches to a prefs object (pure). */
export function applyPatches(prefs: Prefs, patches: PrefPatch[]): Prefs {
  const next: Prefs = { ...prefs };
  for (const p of patches) {
    if (p.pref === null) delete next[p.key];
    else next[p.key] = p.pref;
  }
  return next;
}

/** Keep the top three options that actually add cars. */
export function topLoosenings(options: { option: Loosening; gain: number }[], n = 3) {
  return options.filter((o) => o.gain > 0).sort((a, b) => b.gain - a.gain).slice(0, n);
}
