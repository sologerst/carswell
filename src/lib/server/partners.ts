import "server-only";

import { randomUUID } from "node:crypto";
import type { AppConfig, CreditTier } from "../config";
import { env } from "../env";
import { monthlyPayment } from "../money";
import { ApiError } from "./api";

// Finance and insurance partners (Phase 3). [VERIFY partners] Real lenders
// and carriers integrate through their hosted soft-pull / quote flows, so
// CarSwipe never collects an SSN or date of birth. The "demo" adapters below
// return clearly labeled sample numbers from the app_config assumptions.

export interface PrequalInput { creditTier: CreditTier; amount: number; termMonths: number; annualIncome: number | null; zip: string | null }
export interface PrequalResult {
  partner: string;
  status: "prequalified" | "declined" | "pending";
  maxAmount: number | null;
  apr: number | null;
  termMonths: number;
  monthly: number | null;
  reference: string;
  expiresAt: string;
  disclosure: string;
  sample: boolean;
}

export interface InsuranceInput { vehicleValue: number; year: number; zip: string | null; coverage: "liability" | "full" }
export interface InsuranceQuote {
  partner: string;
  carrier: string;
  monthlyPremium: number;
  coverage: Record<string, string>;
  reference: string;
  expiresAt: string;
  sample: boolean;
}

const DEMO_DISCLOSURE = "Sample result from the demo lender. Not a credit decision or an offer of credit. A real pre-qualification uses the lender's own soft-pull form and doesn't affect your credit score.";

function demoPrequal(input: PrequalInput, cfg: AppConfig): PrequalResult {
  const apr = Math.max(3.9, cfg.finance.apr.used[input.creditTier] - 0.25);
  const incomeCap = input.annualIncome ? Math.round((input.annualIncome * 0.5) / 500) * 500 : null;
  const tierCap = { excellent: 90000, good: 65000, fair: 40000, rebuilding: 22000 }[input.creditTier];
  const maxAmount = Math.min(tierCap, incomeCap ?? tierCap);
  const status = input.amount > maxAmount * 1.15 ? "declined" : "prequalified";
  return {
    partner: "demo", status, maxAmount: status === "declined" ? null : maxAmount, apr: status === "declined" ? null : apr,
    termMonths: input.termMonths,
    monthly: status === "declined" ? null : Math.round(monthlyPayment(Math.min(input.amount, maxAmount), apr, input.termMonths)),
    reference: `DEMO-${randomUUID().slice(0, 8).toUpperCase()}`,
    expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    disclosure: DEMO_DISCLOSURE, sample: true,
  };
}

function demoInsurance(input: InsuranceInput, cfg: AppConfig): InsuranceQuote {
  const age = Math.max(0, new Date().getFullYear() - input.year);
  const base = cfg.cost_to_own.insurance_base_monthly;
  const physical = input.coverage === "full" ? (input.vehicleValue / 10000) * cfg.cost_to_own.insurance_per_10k_value * (age > 10 ? 0.8 : 1) : 0;
  const monthly = Math.round((input.coverage === "liability" ? base * 0.7 : base + physical) * 100) / 100;
  return {
    partner: "demo", carrier: "Demo Mutual (sample)", monthlyPremium: monthly,
    coverage: input.coverage === "full"
      ? { liability: "100/300/100", collision: "$500 deductible", comprehensive: "$500 deductible", uninsured_motorist: "100/300" }
      : { liability: "25/50/25 (TN minimum) [VERIFY]" },
    reference: `DEMO-${randomUUID().slice(0, 8).toUpperCase()}`,
    expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    sample: true,
  };
}

export async function prequalify(input: PrequalInput, cfg: AppConfig): Promise<PrequalResult> {
  switch (env.financePartner) {
    case "demo": return demoPrequal(input, cfg);
    case "none": throw new ApiError(503, "Financing partners aren't enabled.");
    default: throw new ApiError(503, `Finance partner "${env.financePartner}" has no adapter yet. [VERIFY partners]`);
  }
}

export async function insuranceQuote(input: InsuranceInput, cfg: AppConfig): Promise<InsuranceQuote> {
  switch (env.insurancePartner) {
    case "demo": return demoInsurance(input, cfg);
    case "none": throw new ApiError(503, "Insurance partners aren't enabled.");
    default: throw new ApiError(503, `Insurance partner "${env.insurancePartner}" has no adapter yet. [VERIFY partners]`);
  }
}
