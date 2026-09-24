// Perceptual-hash helpers shared by the server and tests. Hashes are 64-char
// bit strings ("0101..."), stored as bit(64) in listing_photos.phash.

export function hamming(a: string, b: string): number {
  if (a.length !== b.length) throw new Error("hash lengths differ");
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

export const isPhash = (s: unknown): s is string => typeof s === "string" && /^[01]{64}$/.test(s);
