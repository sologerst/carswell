// Negotiator v2: counteroffer suggestions. Pure and explainable: every reason
// cites a fact the buyer can see (market comps, days listed, add-on fees).

import type { AppConfig } from "./config";
import type { DealRating } from "./types";
import { outTheDoor } from "./money";

export interface CounterOfferInput {
  vehiclePrice: number;
  docFee: number;
  dealerFees: number;
  tradeCredit: number;
  tradePayoff: number;
  otdTotal: number;
}

export interface CounterListing {
  expectedPrice: number | null;
  daysOnMarket: number;
  dealRating: DealRating | null;
  lastPriceDrop: number | null;
  private: boolean;
}

export interface CounterSuggestion {
  targetOtd: number;
  targetPrice: number;
  savings: number;
  confidence: "low" | "medium" | "high";
  reasons: string[];
  /** Fees worth asking to remove (add-ons beyond the doc fee). */
  askToRemoveFees: number;
}

const ROOM_BY_RATING: Record<DealRating, number> = { great: 0.005, good: 0.01, fair: 0.02, high: 0.035, overpriced: 0.05 };
const round100 = (n: number) => Math.round(n / 100) * 100;
const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export function suggestCounter(offer: CounterOfferInput, listing: CounterListing, cfg: Pick<AppConfig, "tax_tn" | "finance">): CounterSuggestion {
  const reasons: string[] = [];
  const price = offer.vehiclePrice;
  let room = price * (listing.dealRating ? ROOM_BY_RATING[listing.dealRating] : listing.private ? 0.04 : 0.02);

  if (listing.expectedPrice && price > listing.expectedPrice) {
    const over = price - listing.expectedPrice;
    room = Math.max(room, over * 0.8);
    reasons.push(`Similar cars nearby list around ${money(listing.expectedPrice)}, ${money(over)} below this price.`);
  } else if (listing.expectedPrice) {
    reasons.push(`The price is already at or below similar cars nearby (about ${money(listing.expectedPrice)}), so ask modestly.`);
  }
  if (listing.daysOnMarket >= 75) {
    room += price * 0.03;
    reasons.push(`It has been listed for ${listing.daysOnMarket} days; cars that sit this long usually have room.`);
  } else if (listing.daysOnMarket >= 45) {
    room += price * 0.015;
    reasons.push(`It has been listed for ${listing.daysOnMarket} days.`);
  }
  if (listing.lastPriceDrop && listing.lastPriceDrop > 0) {
    reasons.push(`The seller already cut the price by ${money(listing.lastPriceDrop)}, a sign they want to sell.`);
  }
  if (listing.private) reasons.push("Private sellers usually expect some negotiation.");

  const cap = price * (listing.private ? 0.1 : 0.08);
  room = Math.min(room, cap);
  const targetPrice = Math.max(500, round100(price - room));

  const askToRemoveFees = offer.dealerFees > 0 ? offer.dealerFees : 0;
  if (askToRemoveFees) reasons.push(`The offer includes ${money(askToRemoveFees)} in add-on fees beyond the doc fee; ask to remove them.`);
  if (!listing.private && offer.docFee > cfg.finance.default_doc_fee * 1.25) {
    reasons.push(`The doc fee (${money(offer.docFee)}) is higher than typical around here (about ${money(cfg.finance.default_doc_fee)}).`);
  }

  const target = outTheDoor({
    price: targetPrice,
    docFee: offer.docFee,
    dealerFees: offer.dealerFees - askToRemoveFees,
    trade: offer.tradeCredit || offer.tradePayoff ? { has: true, value: offer.tradeCredit, payoff: offer.tradePayoff } : null,
  }, cfg.tax_tn);
  // Never suggest paying more than the offer on the table.
  const targetOtd = Math.min(round100(target.total), round100(offer.otdTotal) - 100);
  const savings = Math.max(0, Math.round(offer.otdTotal - targetOtd));
  const confidence = listing.expectedPrice && price > listing.expectedPrice * 1.03 ? "high" : reasons.length >= 2 ? "medium" : "low";
  return { targetOtd, targetPrice, savings, confidence, reasons, askToRemoveFees };
}
