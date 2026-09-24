import { describe, expect, it } from "vitest";
import { buildAdfXml, parseRelayAddress, relayAddress } from "@/lib/adf";
import { dealBand, marketDeltaText } from "@/lib/deal";
import { pickCanonical } from "@/lib/inventory/dedupe";
import { profileHash } from "@/lib/profile-hash";
import { scoreMessage } from "@/lib/safety/scam";
import { extractFeaturesFromText } from "@/lib/criteria/features";
import { CRITERIA, CATEGORIES } from "@/lib/criteria/catalog";

describe("deal bands", () => {
  it("classifies price vs expected", () => {
    expect(dealBand(9000, 10000)).toBe("great");
    expect(dealBand(9500, 10000)).toBe("good");
    expect(dealBand(10200, 10000)).toBe("fair");
    expect(dealBand(10800, 10000)).toBe("high");
    expect(dealBand(11500, 10000)).toBe("overpriced");
    expect(dealBand(10000, null)).toBeNull();
  });

  it("describes the market delta", () => {
    expect(marketDeltaText(26000, 27900)).toBe("$1,900 below market");
    expect(marketDeltaText(28000, 27200)).toBe("$800 above market");
    expect(marketDeltaText(27000, 27040)).toBeNull();
  });
});

describe("dedupe priority", () => {
  it("prefers dealer feed > private > MarketCheck dealer > MarketCheck private", () => {
    const vin = "1HGCM82633A004352";
    const rows = [
      { id: "mc-private", vin, source: "marketcheck" as const, seller_type: "private" as const, last_seen_at: "2026-09-20" },
      { id: "mc-dealer", vin, source: "marketcheck" as const, seller_type: "dealer" as const, last_seen_at: "2026-09-01" },
      { id: "private", vin, source: "private" as const, seller_type: "private" as const, last_seen_at: "2026-09-01" },
    ];
    expect(pickCanonical(rows).get(vin)).toBe("private");
    expect(pickCanonical([...rows, { id: "feed", vin, source: "dealer_feed", seller_type: "dealer", last_seen_at: "2026-01-01" }]).get(vin)).toBe("feed");
    expect(pickCanonical(rows.slice(0, 2)).get(vin)).toBe("mc-dealer");
  });

  it("breaks ties by freshness", () => {
    const vin = "1HGCM82633A004352";
    const out = pickCanonical([
      { id: "old", vin, source: "marketcheck", seller_type: "dealer", last_seen_at: "2026-09-01" },
      { id: "new", vin, source: "marketcheck", seller_type: "dealer", last_seen_at: "2026-09-20" },
    ]);
    expect(out.get(vin)).toBe("new");
  });
});

describe("ADF XML", () => {
  const xml = buildAdfXml({
    id: "lead-1",
    requestDate: new Date("2026-09-24T12:00:00Z"),
    vehicle: { year: 2021, make: "Toyota", model: "RAV4", trim: "XLE", vin: "2T3P1RFV5MW123456", price: 26995, condition: "used", miles: 41000 },
    customer: { firstName: "Jordan", relayEmail: "lead-abc@relay.carswipe.app", zip: "37206", comments: "Wants AWD & heated seats <asap>" },
    dealerName: "Music City Motors",
    provider: { name: "CarSwipe", url: "https://carswipe.app" },
  });

  it("is ADF 1.0 with escaped content and no buyer email", () => {
    expect(xml.startsWith(`<?xml version="1.0" encoding="UTF-8"?>\n<?adf version="1.0"?>`)).toBe(true);
    expect(xml).toContain(`<vehicle interest="buy" status="used">`);
    expect(xml).toContain("<vin>2T3P1RFV5MW123456</vin>");
    expect(xml).toContain(`<price type="asking" currency="USD">26995</price>`);
    expect(xml).toContain("Wants AWD &amp; heated seats &lt;asap&gt;");
    expect(xml).toContain("<email>lead-abc@relay.carswipe.app</email>");
    expect(xml).toContain("<postalcode>37206</postalcode>");
  });

  it("round-trips relay addresses", () => {
    const id = "20d48907-58e7-464a-9c85-267c85615cfc";
    const addr = relayAddress(id, "relay.carswipe.app");
    expect(addr).toBe("lead-20d4890758e7464a9c85267c85615cfc@relay.carswipe.app");
    expect(parseRelayAddress(`"Dealer" <${addr}>`)).toBe(id);
    expect(parseRelayAddress("someone@else.com")).toBeNull();
  });
});

describe("scam heuristics", () => {
  it("flags classic scam patterns", () => {
    expect(scoreMessage("I'm deployed overseas, pay with gift cards and I'll ship the car to you").flagged).toBe(true);
    expect(scoreMessage("Send me the verification code so I know you're real").flagged).toBe(true);
    expect(scoreMessage("Please send a $500 deposit on Zelle to hold it").score).toBeGreaterThanOrEqual(0.45);
  });

  it("leaves normal dealer messages alone", () => {
    const r = scoreMessage("Saturday at 10 works. I'll have it washed and pulled up front.");
    expect(r.flagged).toBe(false);
    expect(r.score).toBe(0);
  });

  it("treats contact details as a signal only before a match", () => {
    expect(scoreMessage("text me at 615-555-0199", { matched: false }).score).toBeGreaterThan(scoreMessage("text me at 615-555-0199", { matched: true }).score);
  });
});

describe("criteria catalog", () => {
  it("has about 110 criteria across 12 categories", () => {
    expect(CATEGORIES).toHaveLength(12);
    expect(CRITERIA.length).toBeGreaterThanOrEqual(105);
    expect(new Set(CRITERIA.map((c) => c.key)).size).toBe(CRITERIA.length);
    for (const cat of CATEGORIES) expect(CRITERIA.some((c) => c.category === cat.key)).toBe(true);
  });

  it("maps listing text onto canonical feature keys", () => {
    expect(extractFeaturesFromText("Heated seats, Apple CarPlay, panoramic moonroof and a JBL system")).toEqual(
      ["carplay", "heated_seats", "panoramic_roof", "premium_audio", "sunroof"]);
  });
});

describe("profile hash", () => {
  it("is stable across key order and ignores don't-care prefs", () => {
    const a = profileHash({ a: { value: 1, tier: "must", source: "said" }, b: { value: [1, 2], tier: "nice", source: "said" } });
    const b = profileHash({ b: { value: [1, 2], tier: "nice", source: "life" }, a: { value: 1, tier: "must", source: "said" }, c: { value: 3, tier: "dont_care", source: "said" } });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(profileHash({ a: { value: 2, tier: "must", source: "said" } })).not.toBe(a);
  });
});
