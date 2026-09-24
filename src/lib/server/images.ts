import "server-only";

import sharp from "sharp";
import { hamming } from "../safety/phash";

export { hamming };

/**
 * 64-bit difference hash (dHash): grayscale 9x8, one bit per horizontal
 * gradient. Robust to resizing and recompression, so a copied photo still
 * matches after a scammer re-saves it.
 */
export async function dHash(input: Buffer): Promise<string> {
  const { data } = await sharp(input, { failOn: "none" })
    .rotate()
    .greyscale()
    .resize(9, 8, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let bits = "";
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) bits += data[y * 9 + x] < data[y * 9 + x + 1] ? "1" : "0";
  }
  return bits;
}

export interface PhotoQuality {
  width: number;
  height: number;
  brightness: number;
  issues: string[];
}

/** Cheap checks shown to sellers before they publish. */
export async function photoQuality(input: Buffer): Promise<PhotoQuality> {
  const img = sharp(input, { failOn: "none" }).rotate();
  const meta = await img.metadata();
  const stats = await img.stats();
  const brightness = Math.round(stats.channels.slice(0, 3).reduce((s, c) => s + c.mean, 0) / Math.min(3, stats.channels.length));
  const width = meta.autoOrient?.width ?? meta.width ?? 0;
  const height = meta.autoOrient?.height ?? meta.height ?? 0;
  const issues: string[] = [];
  if (Math.max(width, height) < 800) issues.push("Low resolution");
  if (brightness < 45) issues.push("Too dark");
  if (brightness > 235) issues.push("Overexposed");
  if (stats.sharpness !== undefined && stats.sharpness < 0.6) issues.push("Looks blurry");
  return { width, height, brightness, issues };
}

/** Fetch an image with a size cap (used for hotlinked dealer photos). */
export async function fetchImage(url: string, maxBytes = 8 * 1024 * 1024): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const len = Number(res.headers.get("content-length") ?? "0");
    if (len > maxBytes) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.byteLength > maxBytes ? null : buf;
  } catch {
    return null;
  }
}
