// Payment and out-the-door math. Every figure here is an estimate and is
// labeled as such in the UI; payment estimates are not credit offers.

import type { AppConfig, CreditTier } from "./config";
import type { Condition, FuelType, Prefs, TradeIn } from "./types";

export type TaxConfig = AppConfig["tax_tn"];
export type FinanceConfig = AppConfig["finance"];

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface TaxBreakdown {
  state: number;
  local: number;
  singleArticle: number;
  total: number;
}

/**
 * Tennessee sales tax on a vehicle [VERIFY TN rates]: state rate on the full
 * taxable amount, local option rate on the first $1,600, and the state
 * single-article rate on $1,600.01-$3,200.
 */
export function tnSalesTax(taxable: number, cfg: TaxConfig): TaxBreakdown {
  const t = Math.max(0, taxable);
  const state = t * cfg.state_rate;
  const local = Math.min(t, cfg.local_cap) * cfg.local_rate;
  const band = Math.max(0, Math.min(t, cfg.single_article_max) - cfg.single_article_min);
  const singleArticle = band * cfg.single_article_rate;
  return {
    state: round2(state),
    local: round2(local),
    singleArticle: round2(singleArticle),
    total: round2(state + local + singleArticle),
  };
}

export interface OtdInput {
  price: number;
  docFee: number;
  dealerFees?: number;
  trade?: TradeIn | null;
}

export interface OtdBreakdown {
  price: number;
  docFee: number;
  dealerFees: number;
  tradeValue: number;
  tradePayoff: number;
  taxable: number;
  tax: TaxBreakdown;
  titleRegistration: number;
  /** What the buyer pays or finances after the trade: price + fees + tax - trade equity. */
  total: number;
}

/** Out-the-door total. Tennessee taxes the price minus the trade-in value. */
export function outTheDoor(input: OtdInput, cfg: TaxConfig): OtdBreakdown {
  const dealerFees = input.dealerFees ?? 0;
  const tradeValue = input.trade?.has ? Math.max(0, input.trade.value ?? 0) : 0;
  const tradePayoff = input.trade?.has ? Math.max(0, input.trade.payoff ?? 0) : 0;
  const taxable = Math.max(0, input.price + (cfg.doc_fee_taxable ? input.docFee : 0) + dealerFees - tradeValue);
  const tax = tnSalesTax(taxable, cfg);
  const total = input.price + input.docFee + dealerFees + tax.total + cfg.title_registration - tradeValue + tradePayoff;
  return {
    price: input.price,
    docFee: input.docFee,
    dealerFees,
    tradeValue,
    tradePayoff,
    taxable: round2(taxable),
    tax,
    titleRegistration: cfg.title_registration,
    total: round2(total),
  };
}

/**
 * The vehicle price that produces a target out-the-door total with the same
 * fees and trade (used to answer a counteroffer). Whole dollars, rounded down.
 */
export function priceForOtd(targetOtd: number, input: Omit<OtdInput, "price">, cfg: TaxConfig): number {
  let lo = 0;
  let hi = Math.max(1, targetOtd * 2);
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (outTheDoor({ ...input, price: mid }, cfg).total > targetOtd) hi = mid;
    else lo = mid;
  }
  return Math.floor(lo);
}

/** Standard amortized monthly payment. */
export function monthlyPayment(principal: number, aprPercent: number, termMonths: number): number {
  if (principal <= 0 || termMonths <= 0) return 0;
  const r = aprPercent / 100 / 12;
  if (r === 0) return round2(principal / termMonths);
  const payment = (principal * r) / (1 - Math.pow(1 + r, -termMonths));
  return round2(payment);
}

export function aprFor(condition: Condition, credit: CreditTier, cfg: FinanceConfig): number {
  return condition === "new" ? cfg.apr.new[credit] : cfg.apr.used[credit];
}

export interface Budget {
  mode: "cash" | "monthly";
  maxCash?: number;
  maxMonthly?: number;
  down: number;
  termMonths: number;
  credit: CreditTier;
  trade: TradeIn | null;
}

/** Pull the budget out of the buyer's preferences, applying documented defaults. */
export function budgetFromPrefs(prefs: Prefs, fin: FinanceConfig): Budget {
  const v = <T,>(k: string) => prefs[k]?.value as T | undefined;
  const mode = v<string>("budget_mode") === "cash" ? "cash" : "monthly";
  return {
    mode,
    maxCash: numberOrUndefined(v("max_cash_price")),
    maxMonthly: numberOrUndefined(v("max_monthly_payment")),
    down: numberOrUndefined(v("down_payment")) ?? 0,
    termMonths: numberOrUndefined(v("loan_term")) ?? fin.default_term_months,
    credit: (v<CreditTier>("credit_tier") ?? fin.default_credit_tier) as CreditTier,
    trade: (v<TradeIn>("trade_in") ?? null) as TradeIn | null,
  };
}

function numberOrUndefined(x: unknown): number | undefined {
  const n = typeof x === "string" ? Number(x) : x;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

export interface CarCost {
  otd: OtdBreakdown;
  monthly: number;
  apr: number;
}

/** Out-the-door and estimated monthly payment for a car under a budget. */
export function costForCar(price: number, condition: Condition, docFee: number | null, budget: Budget, cfg: AppConfig): CarCost {
  const otd = outTheDoor({ price, docFee: docFee ?? cfg.finance.default_doc_fee, trade: budget.trade }, cfg.tax_tn);
  const apr = aprFor(condition, budget.credit, cfg.finance);
  const financed = Math.max(0, otd.total - budget.down);
  return { otd, apr, monthly: monthlyPayment(financed, apr, budget.termMonths) };
}

/**
 * Highest vehicle price that fits the budget (binary search over the forward
 * math, so it always agrees with what the cards show). Uses used-car APRs,
 * the conservative case, unless only new cars are wanted.
 */
export function maxPriceForBudget(budget: Budget, cfg: AppConfig, condition: Condition = "used"): number | null {
  if (budget.mode === "cash" && !budget.maxCash) return null;
  if (budget.mode === "monthly" && !budget.maxMonthly) return null;
  const fits = (price: number) => {
    const cost = costForCar(price, condition, null, budget, cfg);
    return budget.mode === "cash" ? cost.otd.total <= budget.maxCash! : cost.monthly <= budget.maxMonthly!;
  };
  let lo = 0;
  let hi = 400_000;
  if (!fits(lo)) return 0;
  if (fits(hi)) return hi;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return Math.floor(lo / 50) * 50;
}

/** Plain-English summary of the assumptions behind a payment estimate. */
export function paymentAssumptions(budget: Budget, apr: number): string {
  return `Est. ${apr.toFixed(1)}% APR, ${budget.termMonths} mo, $${budget.down.toLocaleString("en-US")} down, ${budget.credit} credit. Not a credit offer.`;
}

export interface CostToOwn {
  payment: number;
  insurance: number;
  fuel: number;
  upkeep: number;
  total: number;
}

/** Rough monthly cost to own: payment + insurance + fuel + upkeep (estimates). */
export function costToOwn(input: {
  payment: number;
  price: number;
  year: number;
  miles: number;
  fuel: FuelType;
  mpgCity: number | null;
  mpgHwy: number | null;
  bodyStyle: string;
  currentYear?: number;
}, cfg: AppConfig["cost_to_own"]): CostToOwn {
  const age = Math.max(0, (input.currentYear ?? new Date().getFullYear()) - input.year);
  const bodyFactor = input.bodyStyle === "coupe" || input.bodyStyle === "convertible" ? 1.2 : input.bodyStyle === "pickup" ? 1.05 : 1;
  const insurance = (cfg.insurance_base_monthly + (input.price / 10_000) * cfg.insurance_per_10k_value) * bodyFactor;
  let fuel: number;
  if (input.fuel === "electric") {
    fuel = (cfg.miles_per_month / cfg.ev_miles_per_kwh) * cfg.electricity_per_kwh;
  } else {
    const combined = input.mpgCity && input.mpgHwy ? 0.55 * input.mpgCity + 0.45 * input.mpgHwy : 24;
    fuel = (cfg.miles_per_month / combined) * cfg.gas_price_per_gallon;
  }
  const highMiles = input.miles > 100_000 ? 25 : input.miles > 60_000 ? 10 : 0;
  const upkeep = cfg.maintenance_base_monthly + age * cfg.maintenance_per_year_of_age + highMiles;
  const total = input.payment + insurance + fuel + upkeep;
  return {
    payment: Math.round(input.payment),
    insurance: Math.round(insurance),
    fuel: Math.round(fuel),
    upkeep: Math.round(upkeep),
    total: Math.round(total),
  };
}
