import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@/lib/config";
import { budgetFromPrefs, costForCar, maxPriceForBudget, monthlyPayment, outTheDoor, tnSalesTax, type Budget } from "@/lib/money";

const tax = DEFAULT_CONFIG.tax_tn;

describe("Tennessee sales tax", () => {
  it("applies state, local (first $1,600) and single-article ($1,600-$3,200) tax", () => {
    const t = tnSalesTax(30000, tax);
    expect(t.state).toBe(2100);
    expect(t.local).toBe(36);
    expect(t.singleArticle).toBe(44);
    expect(t.total).toBe(2180);
  });

  it("handles small amounts inside the single-article band", () => {
    const t = tnSalesTax(2000, tax);
    expect(t.local).toBe(36);
    expect(t.singleArticle).toBe(11);
  });

  it("never goes negative", () => {
    expect(tnSalesTax(-500, tax).total).toBe(0);
  });
});

describe("out-the-door", () => {
  it("taxes price + doc fee minus trade value, and adds payoff", () => {
    const otd = outTheDoor({ price: 30000, docFee: 699, trade: { has: true, value: 10000, payoff: 4000 } }, tax);
    expect(otd.taxable).toBe(20699);
    expect(otd.tax.total).toBeCloseTo(20699 * 0.07 + 36 + 44, 1);
    expect(otd.total).toBeCloseTo(30000 + 699 + otd.tax.total + 120 - 10000 + 4000, 2);
  });

  it("gives the TN trade-in credit (less tax with a trade)", () => {
    const noTrade = outTheDoor({ price: 30000, docFee: 699 }, tax);
    const withTrade = outTheDoor({ price: 30000, docFee: 699, trade: { has: true, value: 10000 } }, tax);
    expect(noTrade.tax.total - withTrade.tax.total).toBeCloseTo(700, 0);
  });
});

describe("payments", () => {
  it("amortizes like a standard loan", () => {
    expect(monthlyPayment(30000, 6, 60)).toBeCloseTo(579.98, 2);
    expect(monthlyPayment(12000, 0, 48)).toBe(250);
    expect(monthlyPayment(0, 7, 72)).toBe(0);
  });

  it("finds the max price that fits a monthly budget", () => {
    const budget: Budget = { mode: "monthly", maxMonthly: 450, down: 3000, termMonths: 72, credit: "good", trade: null };
    const max = maxPriceForBudget(budget, DEFAULT_CONFIG)!;
    expect(max).toBeGreaterThan(20000);
    expect(costForCar(max, "used", null, budget, DEFAULT_CONFIG).monthly).toBeLessThanOrEqual(450);
    expect(costForCar(max + 200, "used", null, budget, DEFAULT_CONFIG).monthly).toBeGreaterThan(450);
  });

  it("finds the max price that fits a cash budget", () => {
    const budget: Budget = { mode: "cash", maxCash: 28000, down: 0, termMonths: 72, credit: "good", trade: null };
    const max = maxPriceForBudget(budget, DEFAULT_CONFIG)!;
    expect(outTheDoor({ price: max, docFee: 699 }, tax).total).toBeLessThanOrEqual(28000);
    expect(max).toBeGreaterThan(24000);
  });

  it("returns null without a budget amount", () => {
    expect(maxPriceForBudget({ mode: "monthly", down: 0, termMonths: 72, credit: "good", trade: null }, DEFAULT_CONFIG)).toBeNull();
  });

  it("reads documented defaults from prefs", () => {
    const b = budgetFromPrefs({ max_monthly_payment: { value: 500, tier: "must", source: "said" } }, DEFAULT_CONFIG.finance);
    expect(b).toMatchObject({ mode: "monthly", maxMonthly: 500, down: 0, termMonths: 72, credit: "good" });
  });
});
