// Private-listing moderation (Phase 3). Pure rules so they are testable and
// explainable; the server gathers the facts (VIN decode, duplicate VINs,
// photo hash matches, the seller's listing history) and passes them in.
//
// Decisions:
//   block   - a known scam pattern or a hard rule (never goes live)
//   review  - an admin looks at it first
//   approve - live immediately

import type { AppConfig } from "../config";
import { scoreMessage } from "./scam";

export type RiskSeverity = "block" | "high" | "medium" | "low";

export interface RiskFlag {
  code: string;
  severity: RiskSeverity;
  detail: string;
}

export interface ListingRiskInput {
  vinValid: boolean;
  /** NHTSA decode of the VIN, when available. */
  decoded: { year?: number | null; make?: string | null; model?: string | null } | null;
  claimed: { year: number; make: string; model: string };
  price: number;
  /** Market model's expected price for this car, when there are enough comps. */
  expectedPrice: number | null;
  description: string;
  /** The same VIN is live elsewhere. */
  vinElsewhere: { atDealer: boolean; otherPrivateSeller: boolean };
  /** Photos that closely match photos on other listings. */
  reusedPhotos: number;
  /** Photos that are exact or near-exact copies of another listing's. */
  reusedPhotosExact: number;
  /** Private listings this seller published in the last 12 months (excluding this one). */
  sellerListingsLastYear: number;
  phoneVerified: boolean;
  photoCount: number;
  /** Previous listings by this seller that moderators rejected. */
  sellerRejections: number;
}

export interface RiskAssessment {
  score: number;
  decision: "approve" | "review" | "block";
  flags: RiskFlag[];
}

const WEIGHT: Record<RiskSeverity, number> = { block: 1, high: 0.45, medium: 0.25, low: 0.1 };

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Loose make/model match ("Chevrolet" vs "CHEVROLET", "F-150" vs "F150"). */
function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return true;
  return x === y || x.startsWith(y) || y.startsWith(x);
}

export function assessListing(input: ListingRiskInput, cfg: Pick<AppConfig, "moderation" | "private_sales">): RiskAssessment {
  const flags: RiskFlag[] = [];
  const add = (code: string, severity: RiskSeverity, detail: string) => flags.push({ code, severity, detail });

  // Hard rules.
  if (!input.phoneVerified) add("phone_unverified", "block", "Verify your phone number before publishing.");
  if (!input.vinValid) add("vin_invalid", "block", "The VIN check digit doesn't match. Check the VIN on the title or the driver-side door.");
  if (input.sellerListingsLastYear >= cfg.private_sales.max_listings_per_year) {
    add("curbstoning_cap", "block",
      `Private sellers can list ${cfg.private_sales.max_listings_per_year} cars a year. Selling more requires a dealer license.`);
  }
  if (input.photoCount < cfg.private_sales.min_photos) {
    add("too_few_photos", "block", `Add at least ${cfg.private_sales.min_photos} photos.`);
  }

  // Known scam patterns.
  if (input.vinElsewhere.atDealer) {
    add("vin_at_dealer", "block", "This VIN is currently for sale at a dealership.");
  }
  if (input.reusedPhotosExact > 0) {
    add("photos_copied", "block", "Photos match another listing's photos.");
  } else if (input.reusedPhotos > 0) {
    add("photos_similar", "high", "Some photos look very similar to another listing's.");
  }
  const text = scoreMessage(input.description, { matched: false });
  if (text.score >= 0.6) {
    add("scam_text", "block", `The description matches known scam patterns: ${text.reasons.join("; ")}.`);
  } else if (text.score >= 0.25) {
    add("risky_text", "medium", text.reasons.join("; "));
  }

  // Signals for review.
  if (input.vinElsewhere.otherPrivateSeller) add("vin_other_seller", "high", "Another private seller has listed this VIN.");
  if (input.decoded) {
    const { year, make, model } = input.decoded;
    if ((year && year !== input.claimed.year) || !sameName(make, input.claimed.make) || !sameName(model, input.claimed.model)) {
      add("vin_mismatch", "high", `The VIN decodes to ${[year, make, model].filter(Boolean).join(" ")}, not the car described.`);
    }
  }
  if (input.expectedPrice && input.price < input.expectedPrice * cfg.moderation.price_too_low_ratio) {
    add("price_too_low", "high", "The price is far below similar cars, a common bait pattern.");
  }
  if (input.sellerRejections > 0) add("seller_history", "medium", "This seller had a listing rejected before.");

  const score = Math.min(1, Math.round(flags.reduce((s, f) => s + WEIGHT[f.severity], 0) * 100) / 100);
  const decision = flags.some((f) => f.severity === "block") || score >= cfg.moderation.block_score
    ? "block"
    : score >= cfg.moderation.review_score
      ? "review"
      : "approve";
  return { score, decision, flags };
}

/** Strip phone numbers, emails and links from seller copy (contact stays in-app until a match). */
export function scrubContactInfo(text: string): { text: string; removed: boolean } {
  const out = text
    .replace(/(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g, "[contact removed]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[contact removed]")
    .replace(/\bhttps?:\/\/\S+/gi, "[link removed]");
  return { text: out, removed: out !== text };
}
