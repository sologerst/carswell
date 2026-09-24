import { describe, expect, it } from "vitest";
import { isValidVin, modelYearCode, modelYearFromVin, vinCheckDigit, withCheckDigit } from "@/lib/vin";

describe("VIN check digit", () => {
  it("matches known-good VINs", () => {
    expect(vinCheckDigit("1M8GDM9AXKP042788")).toBe("X");
    expect(isValidVin("1M8GDM9AXKP042788")).toBe(true);
    expect(isValidVin("11111111111111111")).toBe(true);
    expect(isValidVin("1HGCM82633A004352")).toBe(true);
  });

  it("rejects bad check digits, bad letters and wrong lengths", () => {
    expect(isValidVin("1M8GDM9A1KP042788")).toBe(false);
    expect(isValidVin("1M8GDM9AXKP04278")).toBe(false);
    expect(isValidVin("1M8GDM9AXKO042788")).toBe(false); // O is never used
  });

  it("repairs position 9", () => {
    expect(withCheckDigit("1M8GDM9A0KP042788")).toBe("1M8GDM9AXKP042788");
  });

  it("maps model years", () => {
    expect(modelYearCode(2019)).toBe("K");
    expect(modelYearCode(2024)).toBe("R");
    expect(modelYearCode(2026)).toBe("T");
    expect(modelYearFromVin("1M8GDM9AXKP042788")).toBe(2019);
  });
});
