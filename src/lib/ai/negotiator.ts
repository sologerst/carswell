import "server-only";

import { z } from "zod";
import { marketDeltaText } from "../deal";
import { usd } from "../format";
import { aiJson, type AiJsonOptions } from "./client";

// The negotiator drafts; the buyer approves, edits or discards. Nothing is
// ever sent automatically.

export type DraftIntent = "request_otd" | "negotiate" | "test_drive" | "trade_in" | "question";

export const INTENT_LABEL: Record<DraftIntent, string> = {
  request_otd: "Ask for the out-the-door price",
  negotiate: "Negotiate the price",
  test_drive: "Set up a test drive",
  trade_in: "Ask about my trade-in",
  question: "Ask a question",
};

export interface DraftContext {
  intent: DraftIntent;
  buyerFirstName: string | null;
  car: { year: number; make: string; model: string; trim: string | null; price: number; expected: number | null; daysOnMarket: number; vin: string };
  dealerName: string | null;
  offers: { otd: number; vehiclePrice: number; fees: number }[];
  budgetText: string | null;
  trade: { value?: number; payoff?: number; description?: string } | null;
  testDriveWindows: { day: string; time: string }[] | null;
  history: { role: "buyer" | "dealer" | "system"; body: string }[];
  note?: string;
}

export function templateDraft(c: DraftContext): string {
  const car = `${c.car.year} ${c.car.make} ${c.car.model}${c.car.trim ? ` ${c.car.trim}` : ""}`;
  const sign = c.buyerFirstName ? `\n\nThanks,\n${c.buyerFirstName}` : "\n\nThanks!";
  switch (c.intent) {
    case "request_otd":
      return `Hi! I'm interested in the ${car} (VIN ending ${c.car.vin.slice(-6)}). Could you send me your best out-the-door price, with tax, title and every fee itemized?${sign}`;
    case "negotiate": {
      const delta = marketDeltaText(c.car.price, c.car.expected);
      const best = c.offers.length ? Math.min(...c.offers.map((o) => o.otd)) : null;
      const target = best ? Math.round((best * 0.97) / 100) * 100 : null;
      const reasons = [
        delta && delta.includes("above") ? `similar cars nearby are listed about ${delta.replace(" above market", "")} lower` : null,
        c.car.daysOnMarket > 30 ? `it's been listed for ${c.car.daysOnMarket} days` : null,
      ].filter(Boolean);
      return `Thanks for the offer on the ${car}. I'm ready to move this ${c.budgetText ? "month" : "soon"}${target ? ` if we can get to ${usd(target)} out the door` : " if there's room on the price"}${reasons.length ? `, since ${reasons.join(" and ")}` : ""}. Can you make that work?${sign}`;
    }
    case "test_drive": {
      const windows = c.testDriveWindows?.length ? c.testDriveWindows.map((w) => `${w.day} ${w.time}`).join(" or ") : "this weekend";
      return `Hi! I'd like to test drive the ${car}. Would ${windows} work? Please confirm it's still available.${sign}`;
    }
    case "trade_in":
      return `I'd like to trade in my ${c.trade?.description ?? "current car"}${c.trade?.payoff ? ` (payoff about ${usd(c.trade.payoff)})` : ""}. What would you offer for it, and can you show the trade credit on the out-the-door sheet?${sign}`;
    case "question":
    default:
      return `Hi! A quick question about the ${car}: ${c.note?.trim() || "are there any open recalls, and do you have the service records?"}${sign}`;
  }
}

const DraftSchema = z.object({ message: z.string() });

const SYSTEM = `You draft messages from a car buyer to a dealer. The buyer will review and edit before sending; never claim it was sent.
Be polite, specific and brief (under 90 words). Ask for itemized out-the-door numbers when talking price. Use only the facts given; don't invent competing offers, prices or promises.
Never include the buyer's email, phone or address. Plain text, no emoji, sign with the buyer's first name if known.`;

export async function aiDraft(c: DraftContext, usage: AiJsonOptions<typeof DraftSchema>["usage"]): Promise<{ body: string; source: "ai" | "template" }> {
  const res = await aiJson({
    feature: "negotiator",
    tier: "frontier",
    effort: "medium",
    maxTokens: 2000,
    system: SYSTEM,
    schema: DraftSchema,
    usage,
    messages: [{
      role: "user",
      content: `Goal: ${INTENT_LABEL[c.intent]}${c.note ? ` (buyer note: ${c.note})` : ""}
Car: ${c.car.year} ${c.car.make} ${c.car.model} ${c.car.trim ?? ""}, listed ${usd(c.car.price)}${c.car.expected ? `, similar local listings about ${usd(c.car.expected)}` : ""}, ${c.car.daysOnMarket} days on market.
Dealer: ${c.dealerName ?? "the dealer"}
Offers so far: ${c.offers.length ? c.offers.map((o) => `${usd(o.otd)} out the door (vehicle ${usd(o.vehiclePrice)}, fees ${usd(o.fees)})`).join("; ") : "none"}
Buyer budget: ${c.budgetText ?? "not shared"}
Trade-in: ${c.trade ? JSON.stringify(c.trade) : "none"}
Test-drive windows: ${c.testDriveWindows?.map((w) => `${w.day} ${w.time}`).join(", ") ?? "none"}
Buyer first name: ${c.buyerFirstName ?? "unknown"}
Recent chat:
${c.history.slice(-8).map((m) => `${m.role}: ${m.body}`).join("\n") || "(none)"}`,
    }],
  });
  if (!res || !res.data.message.trim()) return { body: templateDraft(c), source: "template" };
  return { body: res.data.message.trim().slice(0, 1500), source: "ai" };
}
