// Keyword heuristics for chat safety (the non-AI fallback and a first pass
// before AI scoring). Contact details stay hidden until a match, so pushing a
// conversation off-platform early is itself a signal.

export interface ScamResult {
  score: number;
  flagged: boolean;
  reasons: string[];
}

interface Rule {
  id: string;
  weight: number;
  pattern: RegExp;
  reason: string;
}

const RULES: Rule[] = [
  { id: "wire", weight: 0.5, pattern: /\b(wire (transfer|the money)|western union|moneygram|bank transfer)\b/i, reason: "Asks for a wire transfer" },
  { id: "gift_card", weight: 0.6, pattern: /\b(gift ?cards?|itunes card|google play card|steam card)\b/i, reason: "Mentions gift cards as payment" },
  { id: "p2p_deposit", weight: 0.45, pattern: /\b(zelle|cash ?app|venmo|paypal|crypto|bitcoin|usdt)\b.{0,40}\b(deposit|hold|reserve|first|upfront|before)\b|\b(deposit|hold|reserve)\b.{0,40}\b(zelle|cash ?app|venmo|paypal|crypto|bitcoin)\b/i, reason: "Asks for a deposit through a payment app" },
  { id: "shipping", weight: 0.4, pattern: /\b(ship(ping)? (the car|it) to you|escrow (service|company)|ebay motors protection|vehicle purchase protection)\b/i, reason: "Offers shipping or third-party escrow" },
  { id: "away", weight: 0.35, pattern: /\b(deployed|overseas|out of (the )?(country|state)|military base|offshore rig)\b/i, reason: "Seller claims to be away" },
  { id: "verification_code", weight: 0.6, pattern: /\b(send|give|read) me (the|that|your) (code|verification code|6[- ]digit)|\bgoogle voice\b/i, reason: "Asks for a verification code" },
  { id: "off_platform", weight: 0.25, pattern: /\b(whats ?app|telegram|signal app|text me at|email me at|call me at|contact me (at|on))\b/i, reason: "Pushes the chat off the app" },
  { id: "urgency", weight: 0.15, pattern: /\b(today only|act (fast|now)|first come,? first served|many (people|buyers) interested|won'?t last)\b/i, reason: "High-pressure urgency" },
  { id: "no_inspection", weight: 0.3, pattern: /\b(no (test drives?|inspections?)|can'?t (see|show) (it|the car)|sight unseen)\b/i, reason: "Discourages seeing the car" },
  { id: "overpay", weight: 0.5, pattern: /\b(send (you )?(extra|more than)|overpay|refund the (difference|rest))\b/i, reason: "Overpayment refund pattern" },
  { id: "personal_info", weight: 0.35, pattern: /\b(ssn|social security( number)?|bank (login|password)|routing number)\b/i, reason: "Asks for sensitive personal info" },
];

const PHONE = /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const LINK = /\bhttps?:\/\/(?![\w.-]*carswipe)[\w.-]+/i;

export function scoreMessage(text: string, opts: { matched?: boolean } = {}): ScamResult {
  const reasons: string[] = [];
  let score = 0;
  for (const rule of RULES) {
    if (rule.pattern.test(text)) {
      score += rule.weight;
      reasons.push(rule.reason);
    }
  }
  // Contact info before a match is suspicious; after a match it's normal.
  if (!opts.matched && (PHONE.test(text) || EMAIL.test(text))) {
    score += 0.2;
    reasons.push("Shares contact details before a match");
  }
  if (LINK.test(text)) {
    score += 0.15;
    reasons.push("Links to an outside site");
  }
  const clamped = Math.min(1, Math.round(score * 100) / 100);
  return { score: clamped, flagged: clamped >= 0.6, reasons };
}
