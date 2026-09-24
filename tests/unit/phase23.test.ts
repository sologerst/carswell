import { describe, expect, it } from "vitest";
import { buildIcs, parseTimeRange, resolveDay, resolveWindow } from "@/lib/calendar";
import { DEFAULT_CONFIG } from "@/lib/config";
import { buildBatch, cardBadges, scoreCar, type ScoreContext } from "@/lib/deck/ranking";
import { mapFeedRows, parseCsv } from "@/lib/inventory/csv";
import { outTheDoor, priceForOtd } from "@/lib/money";
import { suggestCounter } from "@/lib/negotiation";
import { normalizeUsPhone, formatUsPhone } from "@/lib/phone";
import { suggestPrivatePrice, tradeInRange } from "@/lib/pricing";
import { assessListing, scrubContactInfo, type ListingRiskInput } from "@/lib/safety/listing-risk";
import { hamming, isPhash } from "@/lib/safety/phash";
import { isPublicHttpsUrl } from "@/lib/url";
import { extractVin, withCheckDigit } from "@/lib/vin";
import { car } from "./helpers";

const VIN = withCheckDigit("2HKRW2H50KL400100");

function listing(overrides: Partial<ListingRiskInput> = {}): ListingRiskInput {
  return {
    vinValid: true,
    decoded: { year: 2019, make: "HONDA", model: "CR-V" },
    claimed: { year: 2019, make: "Honda", model: "CR-V" },
    price: 21400,
    expectedPrice: 23100,
    description: "2019 Honda CR-V EX, one owner, garage kept, new tires last spring.",
    vinElsewhere: { atDealer: false, otherPrivateSeller: false },
    reusedPhotos: 0,
    reusedPhotosExact: 0,
    sellerListingsLastYear: 0,
    phoneVerified: true,
    photoCount: 6,
    sellerRejections: 0,
    ...overrides,
  };
}

describe("private listing moderation", () => {
  it("approves a clean listing", () => {
    const r = assessListing(listing(), DEFAULT_CONFIG);
    expect(r.decision).toBe("approve");
    expect(r.flags).toEqual([]);
  });

  it("blocks known scam patterns", () => {
    const scam = assessListing(listing({ description: "Deployed overseas. Car is with eBay Motors protection shipping; pay with gift cards." }), DEFAULT_CONFIG);
    expect(scam.decision).toBe("block");
    expect(scam.flags.map((f) => f.code)).toContain("scam_text");
    expect(assessListing(listing({ reusedPhotos: 2, reusedPhotosExact: 1 }), DEFAULT_CONFIG).decision).toBe("block");
    expect(assessListing(listing({ vinElsewhere: { atDealer: true, otherPrivateSeller: false } }), DEFAULT_CONFIG).decision).toBe("block");
  });

  it("sends bait prices and VIN mismatches to review", () => {
    const cheap = assessListing(listing({ price: 12000 }), DEFAULT_CONFIG);
    expect(cheap.decision).toBe("review");
    expect(cheap.flags[0].code).toBe("price_too_low");
    const mismatch = assessListing(listing({ decoded: { year: 2017, make: "TOYOTA", model: "Camry" } }), DEFAULT_CONFIG);
    expect(mismatch.flags.map((f) => f.code)).toContain("vin_mismatch");
    expect(mismatch.decision).toBe("review");
  });

  it("enforces fixable hard rules and the yearly private-sale cap", () => {
    expect(assessListing(listing({ phoneVerified: false }), DEFAULT_CONFIG).flags[0].code).toBe("phone_unverified");
    expect(assessListing(listing({ photoCount: 1 }), DEFAULT_CONFIG).flags.map((f) => f.code)).toContain("too_few_photos");
    const cap = DEFAULT_CONFIG.private_sales.max_listings_per_year;
    expect(assessListing(listing({ sellerListingsLastYear: cap }), DEFAULT_CONFIG).flags.map((f) => f.code)).toContain("curbstoning_cap");
    expect(assessListing(listing({ sellerListingsLastYear: cap - 1 }), DEFAULT_CONFIG).decision).toBe("approve");
  });

  it("scrubs contact details from seller copy", () => {
    const r = scrubContactInfo("Call 615-555-0199 or email sam@example.com, pics at https://evil.example/x");
    expect(r.removed).toBe(true);
    expect(r.text).not.toMatch(/615|@|https/);
  });
});

describe("photo hashes", () => {
  it("measures Hamming distance and validates hashes", () => {
    const a = "0".repeat(64);
    expect(hamming(a, `1${"0".repeat(63)}`)).toBe(1);
    expect(isPhash(a)).toBe(true);
    expect(isPhash("0101")).toBe(false);
  });
});

describe("VIN extraction", () => {
  it("finds a VIN in barcode and OCR text", () => {
    expect(extractVin(`I${VIN}`)).toBe(VIN);
    expect(extractVin(`VIN: ${VIN.slice(0, 5)} ${VIN.slice(5)}`)).toBe(VIN);
    expect(extractVin(VIN.replace(/0/g, "O"))).toBe(VIN);
    expect(extractVin("not a vin")).toBeNull();
  });
});

describe("dealer CSV feeds", () => {
  it("parses quoted fields, escaped quotes, CRLF and a BOM", () => {
    const rows = parseCsv('﻿a,b,c\r\n1,"two, 2","say ""hi"""\r\n\r\n');
    expect(rows).toEqual([["a", "b", "c"], ["1", "two, 2", 'say "hi"']]);
  });

  it("maps header aliases and reports bad rows", () => {
    const csv = [
      "Stock No,VIN Number,Model Year,Make,Model,Internet Price,Mileage,Type,Body Style,Color,Image URLs,Dealer Comments,Mystery",
      `A1,${VIN},2019,Honda,CR-V,"$21,995",58200,Certified,SUV,Blue,https://x.example/1.jpg|http://insecure/2.jpg,"Heated seats, CarPlay",?`,
      `A2,${VIN},2019,Honda,CR-V,20000,1,used,SUV,Blue,,,`,
      "A3,1HGCM82633A004353,2003,Honda,Accord,9000,1,used,Sedan,Red,,,",
      `A4,${withCheckDigit("1FTEW1EP0JK000001")},2018,Ford,F-150,,64000,used,Truck,White,,,`,
    ].join("\n");
    const { rows, errors, unmapped } = mapFeedRows(parseCsv(csv));
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.price).toBe(21995);
    expect(r.condition).toBe("cpo");
    expect(r.body_style).toBe("midsize_suv");
    expect(r.photos).toEqual(["https://x.example/1.jpg"]);
    expect(r.features).toEqual(expect.arrayContaining(["heated_seats", "carplay"]));
    expect(r.stock_number).toBe("A1");
    expect(errors.map((e) => e.error)).toEqual(["Duplicate VIN in this file.", "Invalid VIN (check digit).", "Missing price."]);
    expect(unmapped).toEqual(["Mystery"]);
  });

  it("requires VIN and price columns", () => {
    expect(mapFeedRows(parseCsv("make,model\nHonda,Civic")).errors[0].error).toMatch(/VIN and price/);
  });

  it("only fetches public https feed URLs", () => {
    expect(isPublicHttpsUrl("https://dms.example.com/feed.csv")).toBe(true);
    for (const bad of ["http://dms.example.com/f.csv", "https://localhost/f.csv", "https://127.0.0.1/f", "https://10.1.2.3/f", "https://192.168.0.5/f", "https://169.254.169.254/latest", "https://user:pw@example.com/f", "https://[::1]/f", "notaurl"]) {
      expect(isPublicHttpsUrl(bad), bad).toBe(false);
    }
  });
});

describe("negotiator v2 counteroffers", () => {
  const offer = { vehiclePrice: 30000, docFee: 699, dealerFees: 995, tradeCredit: 0, tradePayoff: 0, otdTotal: 0 };
  offer.otdTotal = outTheDoor({ price: offer.vehiclePrice, docFee: offer.docFee, dealerFees: offer.dealerFees }, DEFAULT_CONFIG.tax_tn).total;

  it("suggests a sourced counter below the offer", () => {
    const s = suggestCounter(offer, { expectedPrice: 28000, daysOnMarket: 80, dealRating: "high", lastPriceDrop: 500, private: false }, DEFAULT_CONFIG);
    expect(s.targetOtd).toBeLessThan(offer.otdTotal);
    expect(s.targetPrice).toBeLessThan(offer.vehiclePrice);
    expect(s.askToRemoveFees).toBe(995);
    expect(s.confidence).toBe("high");
    expect(s.reasons.join(" ")).toMatch(/28,000/);
    expect(s.reasons.join(" ")).toMatch(/80 days/);
  });

  it("caps the ask and never exceeds the offer", () => {
    const s = suggestCounter({ ...offer, dealerFees: 0 }, { expectedPrice: 10000, daysOnMarket: 200, dealRating: "overpriced", lastPriceDrop: null, private: false }, DEFAULT_CONFIG);
    expect(s.targetPrice).toBeGreaterThanOrEqual(Math.round(offer.vehiclePrice * 0.92 / 100) * 100);
    const tiny = suggestCounter({ ...offer, dealerFees: 0 }, { expectedPrice: 40000, daysOnMarket: 1, dealRating: "great", lastPriceDrop: null, private: false }, DEFAULT_CONFIG);
    expect(tiny.targetOtd).toBeLessThan(offer.otdTotal);
    expect(tiny.confidence).not.toBe("high");
  });

  it("solves the vehicle price for a target out-the-door total", () => {
    const input = { docFee: 699, dealerFees: 0, trade: { has: true, value: 8000, payoff: 2000 } };
    const price = priceForOtd(25000, input, DEFAULT_CONFIG.tax_tn);
    expect(outTheDoor({ ...input, price }, DEFAULT_CONFIG.tax_tn).total).toBeLessThanOrEqual(25000);
    expect(outTheDoor({ ...input, price: price + 2 }, DEFAULT_CONFIG.tax_tn).total).toBeGreaterThan(25000);
  });
});

describe("pricing helpers", () => {
  it("suggests private prices and trade-in ranges from the market model", () => {
    expect(suggestPrivatePrice(null)).toBeNull();
    const p = suggestPrivatePrice(23100)!;
    expect(p.quick).toBeLessThan(p.low);
    expect(p.low).toBeLessThan(p.high);
    const good = tradeInRange(20000, "good")!;
    const rough = tradeInRange(20000, "rough")!;
    expect(rough.high).toBeLessThan(good.low);
    expect(good.high).toBeLessThan(20000);
  });
});

describe("phone numbers", () => {
  it("normalizes US numbers to E.164", () => {
    expect(normalizeUsPhone("(615) 555-0142")).toBe("+16155550142");
    expect(normalizeUsPhone("1-615-555-0142")).toBe("+16155550142");
    expect(normalizeUsPhone("555-0142")).toBeNull();
    expect(normalizeUsPhone("(015) 555-0142")).toBeNull();
    expect(formatUsPhone("+16155550142")).toBe("(615) 555-0142");
  });
});

describe("test-drive calendar", () => {
  const today = { year: 2026, month: 9, day: 24 }; // a Thursday
  it("parses time ranges", () => {
    expect(parseTimeRange("9am-12pm")).toEqual({ start: { h: 9, m: 0 }, end: { h: 12, m: 0 } });
    expect(parseTimeRange("1pm-3pm")).toEqual({ start: { h: 13, m: 0 }, end: { h: 15, m: 0 } });
    expect(parseTimeRange("2:30pm")).toEqual({ start: { h: 14, m: 30 }, end: { h: 15, m: 30 } });
    expect(parseTimeRange("soon")).toBeNull();
  });

  it("resolves weekday and dated labels", () => {
    expect(resolveDay("Saturday", today)).toEqual({ year: 2026, month: 9, day: 26 });
    expect(resolveDay("Thursday", today)).toEqual(today);
    expect(resolveDay("Sat, Sep 27", today)).toEqual({ year: 2026, month: 9, day: 27 });
    expect(resolveDay("Fri, Jan 2", { year: 2026, month: 12, day: 30 })).toEqual({ year: 2027, month: 1, day: 2 });
    expect(resolveDay("someday", today)).toBeNull();
  });

  it("builds an iCalendar file with a local time zone and escaping", () => {
    const window = resolveWindow({ day: "Saturday", time: "10am-12pm" }, today)!;
    const ics = buildIcs({ uid: "abc@carswipe", window, summary: "Test drive: 2021 Toyota RAV4, XLE", location: "1 Main St; Nashville" }, new Date("2026-09-24T12:00:00Z"));
    expect(ics).toContain("DTSTART;TZID=America/Chicago:20260926T100000");
    expect(ics).toContain("DTEND;TZID=America/Chicago:20260926T120000");
    expect(ics).toContain("SUMMARY:Test drive: 2021 Toyota RAV4\\, XLE");
    expect(ics).toContain("LOCATION:1 Main St\\; Nashville");
    expect(ics.split("\r\n").every((l) => l.length <= 75)).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});

describe("promoted listings", () => {
  const ctx: ScoreContext = { prefs: {}, affinities: new Map(), swipes: 0, radiusMi: 40, maxPrice: 40000, config: DEFAULT_CONFIG };

  it("always labels a promoted card first", () => {
    const s = scoreCar(car({ is_promoted: true, title_status: null }), { ...ctx, prefs: { clean_title: { value: true, tier: "must", source: "said" } } });
    const badges = cardBadges(s, { clean_title: { value: true, tier: "must", source: "said" } });
    expect(badges[0]).toEqual({ kind: "promoted", text: "Promoted" });
  });

  it("boosts at most max_share of a batch", () => {
    const cars = Array.from({ length: 40 }, (_, i) => car({ is_promoted: i < 10, deal_rating: "fair", days_on_market: 10 }));
    const plain = buildBatch(cars.map((c) => ({ ...c, is_promoted: false })), ctx, () => 0.5);
    const promoted = buildBatch(cars, ctx, () => 0.5);
    const cap = Math.max(1, Math.floor(DEFAULT_CONFIG.exploration.batch_size * DEFAULT_CONFIG.promotions.max_share));
    const plainScore = new Map(plain.map((b) => [b.car.id, b.score]));
    const boosted = promoted.filter((b) => b.car.is_promoted && b.score > (plainScore.get(b.car.id) ?? Infinity) + 1e-9);
    expect(boosted.length).toBeLessThanOrEqual(cap);
    expect(boosted.length).toBeGreaterThan(0);
  });
});
