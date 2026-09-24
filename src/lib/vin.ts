// VIN helpers: ISO 3779 check digit (position 9) and model-year codes.

const TRANSLITERATION: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

export const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;
export const VIN_ALPHABET = "ABCDEFGHJKLMNPRSTUVWXYZ0123456789";

function charValue(ch: string): number {
  if (ch >= "0" && ch <= "9") return Number(ch);
  const v = TRANSLITERATION[ch];
  if (v === undefined) throw new Error(`Invalid VIN character: ${ch}`);
  return v;
}

/** The expected check digit ("0"-"9" or "X") for a 17-character VIN. */
export function vinCheckDigit(vin: string): string {
  const upper = vin.toUpperCase();
  if (upper.length !== 17) throw new Error("VIN must be 17 characters");
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += charValue(upper[i]) * WEIGHTS[i];
  const rem = sum % 11;
  return rem === 10 ? "X" : String(rem);
}

/** True when the VIN is well formed and its check digit matches. */
export function isValidVin(vin: string): boolean {
  const upper = vin.trim().toUpperCase();
  if (!VIN_PATTERN.test(upper)) return false;
  return vinCheckDigit(upper) === upper[8];
}

/** Returns the VIN with position 9 set to the correct check digit. */
export function withCheckDigit(vin: string): string {
  const upper = vin.toUpperCase();
  const digit = vinCheckDigit(upper);
  return upper.slice(0, 8) + digit + upper.slice(9);
}

// Position 10 model-year codes for the 2010-2039 cycle.
const YEAR_CODES = "ABCDEFGHJKLMNPRSTVWXY123456789";

export function modelYearCode(year: number): string {
  const idx = (year - 2010) % 30;
  if (year < 2010 || idx < 0) throw new Error("Model year must be 2010 or later");
  return YEAR_CODES[idx];
}

/** Model year from position 10, assuming the 2010-2039 cycle. */
export function modelYearFromVin(vin: string): number | null {
  const idx = YEAR_CODES.indexOf(vin.toUpperCase()[9]);
  return idx === -1 ? null : 2010 + idx;
}

/**
 * Find a valid VIN in scanned or OCR'd text. Door-jamb Code 39 barcodes often
 * carry a leading "I" (import) or trailing characters, and OCR confuses
 * O/0, I/1 and Q/0, which never appear in VINs.
 */
export function extractVin(text: string): string | null {
  const cleaned = text.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const fixed = cleaned.replace(/O/g, "0").replace(/Q/g, "0");
  for (const candidate of [cleaned, fixed, fixed.replace(/I/g, "1")]) {
    for (let i = 0; i + 17 <= candidate.length; i++) {
      const window = candidate.slice(i, i + 17);
      if (isValidVin(window)) return window;
    }
  }
  return null;
}
