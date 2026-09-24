export function usd(n: number | null | undefined, opts: { cents?: boolean } = {}): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: opts.cents ? 2 : 0,
    minimumFractionDigits: opts.cents ? 2 : 0,
  });
}

export function miles(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n < 100) return "New";
  if (n >= 1000) return `${Math.round(n / 1000)}k mi`;
  return `${n} mi`;
}

export function milesLong(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `${n.toLocaleString("en-US")} mi`;
}

export function distance(mi: number | null | undefined): string {
  if (mi === null || mi === undefined) return "";
  return mi < 1 ? "<1 mi away" : `${Math.round(mi)} mi away`;
}

export function relativeTime(iso: string | Date, now: Date = new Date()): string {
  const t = typeof iso === "string" ? new Date(iso) : iso;
  const s = Math.round((now.getTime() - t.getTime()) / 1000);
  const future = s < 0;
  const a = Math.abs(s);
  const unit = a < 60 ? [a, "s"] : a < 3600 ? [Math.round(a / 60), "m"] : a < 86400 ? [Math.round(a / 3600), "h"] : [Math.round(a / 86400), "d"];
  return future ? `in ${unit[0]}${unit[1]}` : `${unit[0]}${unit[1]} ago`;
}

export function titleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

/** Milliseconds since an instant (request-time helper for server components). */
export function msAgo(iso: string | Date): number {
  return Date.now() - new Date(iso).getTime();
}

/** Start of a window N days back, as an ISO string. */
export function daysBackIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}
