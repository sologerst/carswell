// Stable hash of the parts of a buyer profile that change what an AI Car Brief
// would say. Briefs are cached per car + profile hash.

import type { Prefs } from "./types";

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

/** 64-bit FNV-1a, hex. Not cryptographic; only used as a cache key. */
export function fnv1a64(input: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (const byte of new TextEncoder().encode(input)) {
    hash ^= BigInt(byte);
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}

export function profileHash(prefs: Prefs, extra: Record<string, unknown> = {}): string {
  const relevant: Record<string, unknown> = {};
  for (const [key, pref] of Object.entries(prefs)) {
    if (pref.tier === "dont_care") continue;
    relevant[key] = [pref.value, pref.tier];
  }
  return fnv1a64(stableStringify({ prefs: relevant, ...extra }));
}
