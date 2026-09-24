// Pure helpers for reading offers out of dealer email replies (no server-only deps).

export interface ParsedOffer {
  otdTotal: number | null;
  vehiclePrice: number | null;
  fees: number | null;
  notes: string;
}

const money = (s: string) => Number(s.replace(/[$,\s]/g, ""));

/** Regex fallback: find an out-the-door total (and vehicle price) in a dealer's reply. */
export function parseOfferFromText(text: string): ParsedOffer {
  const body = stripQuoted(text);
  const otd = /(?:out[- ]the[- ]door|otd|total(?: price)?|drive[- ]away)[^$\d]{0,30}\$?\s?(\d{1,3}(?:,\d{3})+|\d{4,6})(?:\.\d{2})?/i.exec(body)
    ?? /\$\s?(\d{1,3}(?:,\d{3})+|\d{4,6})(?:\.\d{2})?[^.\n]{0,30}(?:out[- ]the[- ]door|otd|total)/i.exec(body);
  // Only an explicitly labeled vehicle price; "out the door price" is the total, not the vehicle.
  const price = /(?:vehicle|sale|sales|selling|cash) price[^$\d]{0,20}\$?\s?(\d{1,3}(?:,\d{3})+|\d{4,6})/i.exec(body);
  const fees = /(?:doc(?:umentation)? fee|dealer fees?)[^$\d]{0,20}\$?\s?(\d{1,3}(?:,\d{3})*|\d{2,5})/i.exec(body);
  const valid = (n: number | null) => (n !== null && n >= 1000 && n <= 400000 ? n : null);
  return {
    otdTotal: valid(otd ? money(otd[1]) : null),
    vehiclePrice: valid(price ? money(price[1]) : null),
    fees: fees ? money(fees[1]) : null,
    notes: body.slice(0, 1500),
  };
}

/** Drop quoted history ("On ... wrote:" and "> " lines). */
export function stripQuoted(text: string): string {
  const cut = text.split(/\n(?:On .{5,120} wrote:|-{2,}\s*Original Message\s*-{2,}|From: .+)\n/i)[0];
  return cut.split("\n").filter((l) => !l.trim().startsWith(">")).join("\n").trim();
}
