// One canonical card per VIN. Priority: dealer feed > in-app private listing >
// MarketCheck dealer > MarketCheck private-party. Ties go to the freshest row.

export interface DedupeRow {
  id: string;
  vin: string;
  source: "dealer_feed" | "private" | "marketcheck" | "fixture";
  seller_type: "dealer" | "private";
  last_seen_at: string | Date;
}

export function sourcePriority(row: Pick<DedupeRow, "source" | "seller_type">): number {
  switch (row.source) {
    case "dealer_feed":
      return 4;
    case "private":
      return 3;
    case "marketcheck":
    case "fixture":
      return row.seller_type === "dealer" ? 2 : 1;
    default:
      return 0;
  }
}

/** Map of VIN -> id of the canonical row. */
export function pickCanonical(rows: DedupeRow[]): Map<string, string> {
  const best = new Map<string, DedupeRow>();
  for (const row of rows) {
    const vin = row.vin.toUpperCase();
    const current = best.get(vin);
    if (!current) {
      best.set(vin, row);
      continue;
    }
    const a = sourcePriority(row);
    const b = sourcePriority(current);
    if (a > b || (a === b && new Date(row.last_seen_at).getTime() > new Date(current.last_seen_at).getTime())) {
      best.set(vin, row);
    }
  }
  return new Map([...best].map(([vin, row]) => [vin, row.id]));
}
