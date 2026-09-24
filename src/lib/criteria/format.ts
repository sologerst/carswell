import { CRITERION_BY_KEY, type Criterion } from "./catalog";
import type { TradeIn } from "../types";

const money = (n: unknown) => (typeof n === "number" ? `$${n.toLocaleString("en-US")}` : String(n));

/** Plain-English value for a preference chip, e.g. "Compact SUV, 3-row SUV" or "$450/mo". */
export function formatPrefValue(key: string, value: unknown): string {
  const c: Criterion | undefined = CRITERION_BY_KEY[key];
  if (value === null || value === undefined) return "—";
  const label = (v: string) => c?.options?.find((o) => o.value === v)?.label ?? v.replace(/_/g, " ");
  if (key === "trade_in") {
    const t = value as TradeIn;
    if (!t.has) return "No trade";
    return [t.description ?? "Yes", t.value ? `worth ${money(t.value)}` : null, t.payoff ? `owe ${money(t.payoff)}` : null].filter(Boolean).join(", ");
  }
  if (key === "year_range") {
    const r = value as { min?: number; max?: number };
    return r.min && r.max ? `${r.min}-${r.max}` : r.min ? `${r.min} or newer` : r.max ? `${r.max} or older` : "Any";
  }
  if (Array.isArray(value)) return value.map((v) => label(String(v))).join(", ") || "Any";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  switch (c?.kind) {
    case "money":
      return `${money(value)}${c.unit ?? ""}`;
    case "number":
      return `${typeof value === "number" ? value.toLocaleString("en-US") : value}${c.unit ? ` ${c.unit}` : ""}`;
    case "enum":
      return label(String(value));
    default:
      return String(value);
  }
}
