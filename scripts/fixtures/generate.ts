// Generates supabase/seed.sql: 300 synthetic Nashville cars, demo dealers,
// app_config defaults and demo accounts. Deterministic (seeded PRNG), so the
// output only changes when this script or its inputs change.
//
//   npm run fixtures

import { writeFileSync } from "node:fs";
import { DEFAULT_CONFIG, CONFIG_DESCRIPTIONS, type AppConfig } from "../../src/lib/config";
import { VIN_ALPHABET, modelYearCode, withCheckDigit } from "../../src/lib/vin";
import { CATALOG, type ModelSpec, type BodyStyle, type FuelType } from "./catalog";
import { DEALERS, ZIPS, type DealerRow } from "./places";

const LISTING_COUNT = 300;
const CURRENT_YEAR = 2026;
export const DEMO_PASSWORD = "carswipe-demo";

// Seeded PRNG -----------------------------------------------------------------
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260924);
const uniform = (min: number, max: number) => min + (max - min) * rand();
const int = (min: number, max: number) => Math.floor(uniform(min, max + 1));
const chance = (p: number) => rand() < p;
function normal(mean = 0, sd = 1) {
  const u = Math.max(rand(), 1e-9);
  const v = rand();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function weighted<T>(items: [T, number][]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [item, w] of items) {
    r -= w;
    if (r <= 0) return item;
  }
  return items[items.length - 1][0];
}
const pick = <T,>(items: T[]): T => items[Math.floor(rand() * items.length)];
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// Deterministic UUIDs so demo data can reference rows.
function uuidFrom(n: number, prefix: string): string {
  const hex = (prefix + n.toString(16)).padStart(32, "0").slice(-32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

// SQL helpers -----------------------------------------------------------------
type SqlValue = string | number | boolean | null | undefined | string[] | { raw: string };
function sql(v: SqlValue): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (Array.isArray(v)) return v.length ? `array[${v.map((s) => sql(s)).join(", ")}]::text[]` : "'{}'::text[]";
  if (typeof v === "object") return v.raw;
  return `'${v.replace(/'/g, "''")}'`;
}
const raw = (s: string) => ({ raw: s });
const json = (o: unknown) => raw(`${sql(JSON.stringify(o))}::jsonb`);
function insert(table: string, rows: Record<string, SqlValue>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const values = rows.map((r) => `  (${cols.map((c) => sql(r[c])).join(", ")})`).join(",\n");
  return `insert into ${table} (${cols.join(", ")}) values\n${values};\n`;
}

// Colors ------------------------------------------------------------------------
interface Paint { family: string; name: string; hex: string }
const PAINTS: [Paint[], number][] = [
  [[{ family: "white", name: "Pearl White", hex: "eef0f2" }, { family: "white", name: "Glacier White", hex: "f4f5f6" }, { family: "white", name: "Summit White", hex: "e9ebee" }], 24],
  [[{ family: "black", name: "Midnight Black", hex: "15171b" }, { family: "black", name: "Agate Black", hex: "1d1f24" }], 20],
  [[{ family: "gray", name: "Magnetic Gray", hex: "5d636b" }, { family: "gray", name: "Lunar Rock", hex: "8e918c" }, { family: "gray", name: "Carbonized Gray", hex: "4a4e55" }], 20],
  [[{ family: "silver", name: "Celestial Silver", hex: "b9bec5" }, { family: "silver", name: "Iconic Silver", hex: "a9aeb5" }], 11],
  [[{ family: "blue", name: "Blueprint", hex: "2b4a7e" }, { family: "blue", name: "Atlas Blue", hex: "1f3b66" }, { family: "blue", name: "Cavalry Blue", hex: "3d6f9e" }], 10],
  [[{ family: "red", name: "Ruby Flare", hex: "8f1d24" }, { family: "red", name: "Rapid Red", hex: "a3232b" }, { family: "red", name: "Soul Red", hex: "9e1b25" }], 9],
  [[{ family: "green", name: "Army Green", hex: "4f5a43" }, { family: "green", name: "Cypress", hex: "5b6b55" }], 3],
  [[{ family: "brown", name: "Kalahari", hex: "8a7458" }, { family: "brown", name: "Desert Sand", hex: "b19f82" }], 2],
  [[{ family: "orange", name: "Hyper Orange", hex: "d2632b" }], 1],
];
const HUE: Record<string, number | null> = {
  white: null, black: null, gray: null, silver: null,
  blue: 220, red: 355, green: 110, brown: 35, orange: 22,
};
const LIGHTNESS: Record<string, number> = {
  white: 1, silver: 0.75, gray: 0.45, black: 0, blue: 0.35, red: 0.4, green: 0.4, brown: 0.55, orange: 0.6,
};

// Feature assignment ----------------------------------------------------------
function featuresFor(spec: ModelSpec, year: number, tier: number, trim: string, body: BodyStyle): string[] {
  const f = new Set<string>();
  const age = CURRENT_YEAR - year;
  f.add("bluetooth");
  if (year >= 2016) f.add("backup_camera");
  if (year >= 2017 && !chance(0.1)) { f.add("carplay"); f.add("android_auto"); }
  if (year >= 2018 && (chance(0.8) || tier >= 1)) f.add("auto_emergency_braking");
  if (year >= 2019 && (tier >= 1 || chance(0.5))) { f.add("adaptive_cruise"); f.add("lane_keep"); }
  if (tier >= 1 || chance(0.35)) { f.add("blind_spot"); f.add("rear_cross_traffic"); }
  if (tier >= 1) { f.add("keyless_entry"); f.add("dual_zone_climate"); }
  if (tier >= 1 && chance(0.7)) f.add("heated_seats");
  if (tier >= 1 && chance(0.5)) f.add("remote_start");
  if (tier >= 1 && chance(0.45)) f.add("sunroof");
  if (tier >= 2) { f.add("power_seats"); f.add("auto_dimming_mirror"); f.add("heated_seats"); f.add("parking_sensors"); }
  if (tier >= 2 && chance(0.6)) f.add("wireless_charging");
  if (tier >= 2 && chance(0.6)) f.add("navigation");
  if (tier >= 2 && chance(0.5)) f.add("heated_wheel");
  if (tier >= 2 && chance(0.4)) f.add("rain_sensing_wipers");
  if (tier >= 3) { f.add("leather"); f.add("memory_seats"); f.add("premium_audio"); f.add("navigation"); }
  if (tier >= 3 && chance(0.75)) f.add("cooled_seats");
  if (tier >= 3 && chance(0.65)) f.add("camera_360");
  if (tier >= 3 && chance(0.5)) { f.add("panoramic_roof"); f.add("sunroof"); }
  if (tier >= 3 && chance(0.4) && year >= 2019) f.add("head_up_display");
  if (["compact_suv", "midsize_suv", "three_row_suv", "wagon"].includes(body)) {
    if (tier >= 1 && chance(0.7)) f.add("power_liftgate");
    if (chance(0.7)) f.add("roof_rails");
  }
  if (body === "minivan" && tier >= 1) f.add("power_liftgate");
  if (spec.thirdRow) f.add("third_row_seat");
  if (spec.seats >= 7 && tier >= 2) f.add("tri_zone_climate");
  if (body === "pickup") {
    if (chance(0.6)) f.add("bed_liner");
    if (chance(0.6)) f.add("tow_package");
    if (chance(0.45)) f.add("running_boards");
  } else if ((spec.towing ?? 0) >= 5000 && chance(0.35)) {
    f.add("tow_package");
  }
  if (/TRD|Rubicon|TrailSport|Trailhawk|Wilderness|Badlands|PRO-4X|ZR2|AT4|X-Pro|Trail Boss|Z71|Rock Creek|Rebel/.test(trim)) {
    f.add("off_road_package");
    if (chance(0.7)) f.add("skid_plates");
    if (chance(0.5)) f.add("all_weather_mats");
  } else if (chance(0.15)) {
    f.add("all_weather_mats");
  }
  if (["Jeep", "Subaru"].includes(spec.make) && chance(0.3)) f.add("washable_interior");
  if (age > 8) { f.delete("wireless_charging"); f.delete("head_up_display"); }
  return [...f].sort();
}

// Style embedding (16 dims) ------------------------------------------------------
function embedding(spec: ModelSpec, tier: number, trim: string, family: string): number[] {
  const tr = spec.traits;
  const hue = HUE[family];
  const sporty = /Sport|GT|N Line|RST|TRD|XSE|SE|Si|M40i|M340i|AMG|Scat|R\/T|Type S|F Sport|Performance/.test(trim) ? 1 : 0;
  const rugged = /TRD|Rubicon|TrailSport|Trailhawk|Wilderness|Badlands|PRO-4X|ZR2|AT4|X-Pro|Trail Boss|Z71|Rock Creek|Rebel/.test(trim) ? 1 : 0;
  const v = [
    tr.boxy * 1.2,
    Math.min(1, tr.sporty + 0.2 * sporty) * 1.2,
    Math.min(1, tr.rugged + 0.2 * rugged) * 1.2,
    Math.min(1, tr.luxe + 0.07 * tier) * 1.2,
    tr.family * 1.0,
    tr.eco * 0.9,
    clamp((spec.length - 165) / 70, 0, 1) * 0.8,
    spec.body === "pickup" ? 0.8 : 0,
    ["sedan", "coupe", "hatchback", "convertible"].includes(spec.body) ? 0.7 : 0,
    LIGHTNESS[family] * 0.6,
    hue === null ? 0 : Math.cos((hue * Math.PI) / 180) * 0.5,
    hue === null ? 0 : Math.sin((hue * Math.PI) / 180) * 0.5,
    hue === null ? 0 : 0.5,
    (tier / 3) * 0.5,
    sporty * 0.4,
    normal(0, 0.08),
  ].map((x) => x + normal(0, 0.03));
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => Number((x / norm).toFixed(4)));
}

// VINs ----------------------------------------------------------------------
const usedVins = new Set<string>();
function makeVin(spec: ModelSpec, year: number): string {
  for (;;) {
    const wmi = pick(spec.wmi).slice(0, 3).padEnd(3, "1");
    let vds = "";
    for (let i = 0; i < 5; i++) vds += VIN_ALPHABET[Math.floor(rand() * 23)];
    const plant = VIN_ALPHABET[Math.floor(rand() * VIN_ALPHABET.length)];
    const serial = String(int(100000, 999999));
    const vin = withCheckDigit(`${wmi}${vds}0${modelYearCode(year)}${plant}${serial}`);
    if (!usedVins.has(vin)) {
      usedVins.add(vin);
      return vin;
    }
  }
}

// Listing generation -----------------------------------------------------------
const dealerIds = DEALERS.map((_, i) => uuidFrom(i + 1, "d0"));
const demoDealerId = dealerIds[0];

interface Generated {
  row: Record<string, SqlValue>;
  photos: string[];
  embedding: number[];
  priceDrop: { old: number; daysAgo: number } | null;
  dealerIndex: number | null;
}

function priceRound(x: number) {
  return Math.max(1995, Math.round(x / 100) * 100 - 5);
}

function describe(spec: ModelSpec, year: number, trim: string, paint: Paint, miles: number, features: string[],
  owners: number | null, accidents: number | null, condition: string, dealerName: string | null): string {
  const bits: string[] = [];
  bits.push(`${condition === "cpo" ? "Certified pre-owned " : condition === "new" ? "Brand new " : ""}${year} ${spec.make} ${spec.model} ${trim} in ${paint.name}.`);
  if (condition !== "new") bits.push(`${miles.toLocaleString("en-US")} miles${owners === 1 ? ", one owner" : ""}${accidents === 0 ? ", clean history report" : ""}.`);
  const highlights = features
    .filter((f) => ["leather", "sunroof", "panoramic_roof", "heated_seats", "cooled_seats", "adaptive_cruise", "camera_360", "premium_audio", "tow_package", "third_row_seat", "off_road_package", "remote_start", "navigation", "carplay"].includes(f))
    .slice(0, 5)
    .map((f) => ({
      leather: "leather seats", sunroof: "sunroof", panoramic_roof: "panoramic roof", heated_seats: "heated seats",
      cooled_seats: "ventilated seats", adaptive_cruise: "adaptive cruise control", camera_360: "360 camera",
      premium_audio: "premium audio", tow_package: "tow package", third_row_seat: "third-row seating",
      off_road_package: "off-road package", remote_start: "remote start", navigation: "navigation", carplay: "Apple CarPlay",
    }[f] as string));
  if (highlights.length) bits.push(`Loaded with ${highlights.join(", ")}.`);
  if (dealerName) bits.push(pick(["Financing available for all credit types.", "Trade-ins welcome.", "Serviced and detailed, ready to go.", "Call or text to schedule a test drive."]));
  else bits.push(pick(["Selling because we upgraded.", "Garage kept, non-smoker.", "Runs great, no issues."]));
  return bits.join(" ");
}

function generateListing(n: number): Generated {
  const isPrivate = chance(0.07);
  const dealerIndex = isPrivate ? null : DEALERS.indexOf(weighted(DEALERS.map((d) => [d, d.size] as [DealerRow, number])));
  const dealer = dealerIndex === null ? null : DEALERS[dealerIndex];

  let pool = CATALOG;
  if (dealer && dealer.makes.length && chance(0.8)) pool = CATALOG.filter((m) => dealer.makes.includes(m.make));
  const spec = weighted(pool.map((m) => [m, m.weight] as [ModelSpec, number]));

  const condition = isPrivate ? "used" : weighted([["new", dealer?.makes.length ? 0.16 : 0], ["cpo", dealer?.makes.length ? 0.16 : 0.06], ["used", 0.72]] as [string, number][]);
  const firstYear = spec.firstYear ?? 2015;
  let year: number;
  if (condition === "new") year = weighted([[2026, 0.6], [2027, 0.4]]);
  else if (condition === "cpo") year = int(Math.max(firstYear, 2021), 2025);
  else year = Math.max(firstYear, weighted([[2015, 2], [2016, 3], [2017, 5], [2018, 7], [2019, 9], [2020, 10], [2021, 11], [2022, 11], [2023, 10], [2024, 8], [2025, 5]] as [number, number][]));
  const age = Math.max(0, CURRENT_YEAR - year);

  let miles: number;
  if (condition === "new") miles = int(5, 60);
  else miles = Math.max(2500, Math.round(Math.max(0.5, age) * normal(12500, 4000) / 10) * 10);
  if (condition === "cpo") miles = Math.min(miles, int(15000, 62000));

  const [trim, trimDelta, tier] = pick(spec.trims);
  const fuel: FuelType = weighted(spec.fuels ?? [["gas", 1]]);
  const drivetrain = spec.body === "pickup" && spec.drives.includes("4wd") && chance(0.7) ? "4wd" : pick(spec.drives);
  const paint = pick(weighted(PAINTS));

  const msrpYear = (spec.msrp + trimDelta) * (1 - 0.025 * Math.max(0, CURRENT_YEAR - year));
  const accidents = chance(0.07) ? null : weighted([[0, 0.8], [1, 0.16], [2, 0.04]] as [number, number][]);
  let expected: number;
  if (condition === "new") {
    expected = msrpYear * uniform(0.98, 1.02);
  } else {
    const mileDelta = (miles - Math.max(age, 0.5) * 12000) / 10000;
    expected = msrpYear * Math.pow(spec.retention, Math.max(age, 0.6)) * clamp(1 - 0.035 * mileDelta, 0.7, 1.12);
    if (condition === "cpo") expected *= 1.04;
  }
  let price = expected * (1 + normal(0, 0.055));
  if (accidents && accidents > 0) price *= 0.93;
  if (isPrivate) price *= 0.95;
  price = priceRound(price);
  const expectedPrice = Math.round(expected);
  const ratio = price / expected;
  const dealRating = condition === "new" ? null
    : ratio <= 0.9 ? "great" : ratio <= 0.97 ? "good" : ratio <= 1.03 ? "fair" : ratio <= 1.1 ? "high" : "overpriced";

  const features = featuresFor(spec, year, tier, trim, spec.body);
  const featuresVerified = !isPrivate && chance(0.72);
  const reportedFeatures = featuresVerified ? features : features.filter(() => chance(0.7));

  const titleStatus = condition === "new" ? "clean" : weighted([["clean", 0.93], ["rebuilt", 0.025], ["salvage", 0.01], [null, 0.035]] as [string | null, number][]);
  const owners = condition === "new" ? 0 : chance(0.07) ? null : weighted([[1, 0.56], [2, 0.3], [3, 0.1], [4, 0.04]] as [number, number][]);
  const personalUse = condition === "new" ? true : chance(0.07) ? null : chance(0.9);
  const interiorMaterial = tier >= 3 ? "leather" : tier === 2 ? weighted([["synthetic_leather", 0.6], ["leather", 0.4]] as [string, number][]) : tier === 1 ? weighted([["cloth", 0.7], ["synthetic_leather", 0.3]] as [string, number][]) : "cloth";
  const interiorColor = weighted([["Black", 0.6], ["Gray", 0.2], ["Tan", 0.12], ["Brown", 0.08]] as [string, number][]);
  const daysOnMarket = Math.min(120, Math.floor(-Math.log(Math.max(rand(), 1e-6)) * 24));
  const priceDrop = daysOnMarket > 10 && chance(0.28) ? { old: price + int(5, 25) * 100, daysAgo: Math.floor(daysOnMarket / 2) } : null;

  let lat: number, lng: number, zip: string;
  if (dealer) {
    lat = dealer.lat; lng = dealer.lng; zip = dealer.zip;
  } else {
    const z = pick(ZIPS);
    lat = Number((z.lat + normal(0, 0.012)).toFixed(5));
    lng = Number((z.lng + normal(0, 0.012)).toFixed(5));
    zip = z.zip;
  }

  const photoCount = isPrivate ? int(2, 4) : int(3, 6);
  const photos = Array.from({ length: photoCount }, (_, i) => `/fx/car/${spec.body}/${paint.hex}/${(i + n) % 6}`);
  const id = uuidFrom(n, "c0");
  const sourceId = `fx-${String(n).padStart(4, "0")}`;
  const description = describe(spec, year, trim, paint, miles, reportedFeatures, owners, accidents, condition, dealer?.name ?? null);
  const quality = clamp(0.3 + photoCount * 0.08 + (featuresVerified ? 0.15 : 0) + (description.length > 120 ? 0.08 : 0), 0, 1);
  const recalls = condition === "new" ? 0 : weighted([[0, 0.88], [1, 0.1], [2, 0.02]] as [number, number][]);
  const mpgNoise = fuel === "hybrid" && spec.fuels?.some(([f]) => f === "gas") ? 1.3 : 1;

  return {
    dealerIndex,
    photos,
    priceDrop,
    embedding: embedding(spec, tier, trim, paint.family),
    row: {
      id,
      vin: makeVin(spec, year),
      source: "fixture",
      source_id: sourceId,
      source_url: isPrivate ? `https://example.com/private-listings/${sourceId}` : null,
      market_id: "nashville",
      dealership_id: dealer ? dealerIds[dealerIndex!] : null,
      seller_type: isPrivate ? "private" : "dealer",
      year,
      make: spec.make,
      model: spec.model,
      trim_level: trim,
      body_style: spec.body,
      condition,
      price,
      msrp: Math.round(msrpYear / 100) * 100,
      miles,
      exterior_color: paint.name,
      exterior_color_family: paint.family,
      interior_color: interiorColor,
      interior_material: interiorMaterial,
      fuel_type: fuel,
      drivetrain,
      transmission: spec.transmission ?? (fuel === "electric" ? "automatic" : "automatic"),
      engine: fuel === "hybrid" && !spec.engine.includes("Hybrid") ? `${spec.engine} Hybrid` : spec.engine,
      cylinders: spec.cylinders,
      horsepower: spec.hp + tier * 5,
      mpg_city: fuel === "electric" ? null : Math.round(spec.mpg[0] * mpgNoise),
      mpg_hwy: fuel === "electric" ? null : Math.round(spec.mpg[1] * (mpgNoise > 1 ? 1.1 : 1)),
      ev_range_mi: fuel === "electric" ? Math.round((spec.evRange ?? 250) * (1 - 0.02 * age) + tier * 8) : null,
      seats: spec.seats,
      third_row: spec.thirdRow ?? false,
      doors: spec.body === "coupe" || spec.body === "convertible" ? 2 : 4,
      length_in: spec.length,
      towing_lbs: spec.towing ?? null,
      features: reportedFeatures,
      features_verified: featuresVerified,
      title_status: titleStatus,
      accident_count: condition === "new" ? 0 : accidents,
      owner_count: owners,
      personal_use: personalUse,
      service_records: condition === "new" ? null : chance(0.55) ? true : null,
      open_recalls: recalls,
      description,
      zip,
      lat,
      lng,
      expected_price: condition === "new" ? null : expectedPrice,
      deal_rating: dealRating,
      quality_score: Number(quality.toFixed(2)),
      photo_count: photoCount,
      is_canonical: true,
      first_seen_at: raw(`now() - interval '${daysOnMarket} days' - interval '${int(0, 23)} hours'`),
      last_seen_at: raw("now()"),
    },
  };
}

const listings: Generated[] = [];
for (let i = 1; i <= LISTING_COUNT; i++) listings.push(generateListing(i));

// A few duplicate VINs from a second source exercise the one-card-per-VIN rule.
const duplicates = listings.slice(10, 14).map((g, i) => ({
  ...g.row,
  id: uuidFrom(900 + i, "c0"),
  source: "marketcheck",
  source_id: `mc-dup-${i + 1}`,
  price: (g.row.price as number) + 300,
  is_canonical: false,
  first_seen_at: raw("now() - interval '3 days'"),
}));

// Demo accounts --------------------------------------------------------------------
const DEMO_USERS = [
  { id: "00000000-0000-4000-8000-00000000a001", email: "admin@carswipe.dev", first: "Avery", admin: true, zip: "37203" },
  { id: "00000000-0000-4000-8000-00000000d001", email: "dealer@carswipe.dev", first: "Dana", admin: false, zip: "37210" },
  { id: "00000000-0000-4000-8000-00000000b001", email: "buyer@carswipe.dev", first: "Jordan", admin: false, zip: "37206" },
];
const BUYER_ID = DEMO_USERS[2].id;

function demoUsersSql(): string {
  const users = DEMO_USERS.map((u) => `  ('00000000-0000-0000-0000-000000000000', '${u.id}', 'authenticated', 'authenticated', '${u.email}',
   extensions.crypt('${DEMO_PASSWORD}', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}',
   now(), now(), '', '', '', '')`).join(",\n");
  const identities = DEMO_USERS.map((u) => `  ('${u.id}', '${u.id}', '${u.id}', jsonb_build_object('sub', '${u.id}', 'email', '${u.email}', 'email_verified', true), 'email', now(), now(), now())`).join(",\n");
  return `-- Demo accounts (local development only). Password: ${DEMO_PASSWORD}
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
  email_change_token_new, email_change) values
${users};

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at) values
${identities};

${DEMO_USERS.map((u) => `update public.profiles set first_name = '${u.first}', zip = '${u.zip}', is_admin = ${u.admin}${u.id === BUYER_ID ? ", onboarding_completed_at = now() - interval '2 days', onboarding_method = 'chat', swipe_count = 3, phone = '615-555-0142'" : ""} where id = '${u.id}';`).join("\n")}

insert into public.dealership_members (dealership_id, user_id, role) values ('${demoDealerId}', '${DEMO_USERS[1].id}', 'owner');
`;
}

function demoBuyerSql(): string {
  const prefs: [string, unknown, string, string][] = [
    ["budget_mode", "monthly", "dealbreaker", "said"],
    ["max_monthly_payment", 575, "dealbreaker", "said"],
    ["down_payment", 3000, "nice", "said"],
    ["loan_term", 72, "nice", "default"],
    ["credit_tier", "good", "nice", "said"],
    ["trade_in", { has: true, value: 12000, payoff: 4000, description: "2016 Honda Civic" }, "nice", "said"],
    ["financing_status", "needs", "nice", "said"],
    ["condition", ["used", "cpo"], "dealbreaker", "said"],
    ["body_styles", ["compact_suv", "midsize_suv", "three_row_suv"], "must", "life"],
    ["min_seats", 5, "must", "life"],
    ["drivetrains", ["awd", "4wd"], "nice", "life"],
    ["clean_title", true, "dealbreaker", "said"],
    ["no_accidents", true, "must", "said"],
    ["timeline", "month", "nice", "said"],
    ["features", ["carplay", "heated_seats", "adaptive_cruise"], "nice", "life"],
    ["life_story", "Two kids and a golden retriever, weekend trips to the lake, 30-minute highway commute.", "nice", "life"],
  ];
  const prefRows = prefs.map(([key, value, tier, source]) => ({ user_id: BUYER_ID, key, value: json(value), tier, source }));

  // Three likes on the demo dealer's cars: one new lead, one with an offer,
  // one matched with an open chat.
  const demoCars = listings.filter((g) => g.dealerIndex === 0 && g.row.condition !== "new").slice(0, 3);
  if (demoCars.length < 3) throw new Error("demo dealer needs at least 3 used cars");
  const interestIds = ["00000000-0000-4000-8000-0000000e0001", "00000000-0000-4000-8000-0000000e0002", "00000000-0000-4000-8000-0000000e0003"];
  const statuses = ["sent", "offered", "matched"];
  const dossier = {
    first_name: "Jordan", zip: "37206",
    preferences: { budget_mode: "monthly", max_monthly_payment: 575, down_payment: 3000, credit_tier: "good", trade_in: { has: true, value: 12000, payoff: 4000 }, financing_status: "needs", timeline: "month", body_styles: ["compact_suv", "midsize_suv", "three_row_suv"] },
    top_tastes: ["body:midsize_suv", "drive:awd", "color:blue"], swipe_count: 3,
    ai_summary: "Family of four with a dog, lake weekends, highway commute. Wants AWD and room for gear.",
  };
  let out = insert("public.buyer_preferences", prefRows);
  out += insert("public.swipes", demoCars.map((g, i) => ({
    user_id: BUYER_ID, listing_id: g.row.id as string, action: i === 2 ? "superlike" : "like",
    client_id: uuidFrom(i + 1, "5a"), swiped_at: raw(`now() - interval '${2 - i} days'`), received_at: raw(`now() - interval '${2 - i} days'`),
  })));
  out += insert("public.interests", demoCars.map((g, i) => ({
    id: interestIds[i], user_id: BUYER_ID, listing_id: g.row.id as string, dealership_id: demoDealerId,
    swipe_client_id: uuidFrom(i + 1, "5a"), kind: i === 2 ? "superlike" : "like", status: statuses[i],
    test_drive_windows: i === 2 ? json([{ day: "Saturday", time: "10am-12pm" }, { day: "Sunday", time: "1pm-3pm" }]) : null,
    dossier: json(dossier),
    lead_summary: "Jordan is a family buyer financing about $575/mo with $3,000 down and a 2016 Civic trade (≈$8k equity). Shopping this month; wants AWD, CarPlay and heated seats.",
    sla_expires_at: raw(`now() + interval '${36 + i * 4} hours'`),
    matched_at: i === 2 ? raw("now() - interval '6 hours'") : null,
    created_at: raw(`now() - interval '${2 - i} days'`),
  })));
  out += insert("public.lead_deliveries", demoCars.map((_, i) => ({
    interest_id: interestIds[i], dealership_id: demoDealerId, channel: "inbox", status: i === 0 ? "pending" : "sent",
    sent_at: i === 0 ? null : raw("now() - interval '1 day'"),
  })));
  const offerFor = (g: Generated, status: string, id: string) => {
    const price = (g.row.price as number) - 700;
    const doc = DEALERS[0].docFee;
    const trade = 12000;
    const taxable = price + doc - trade;
    const tax = Math.round(taxable * 0.07 + 1600 * 0.0225 + 1600 * 0.0275);
    const otd = price + doc + tax + 120 - trade + 4000;
    return { id, interest_id: interestIds[statuses.indexOf(status === "picked" ? "matched" : "offered")], dealership_id: demoDealerId,
      created_by: DEMO_USERS[1].id, vehicle_price: price, doc_fee: doc, dealer_fees: 0, tax, title_fees: 120,
      trade_credit: trade, otd_total: otd, monthly_estimate: null, apr: 7.9, term_months: 72,
      notes: "Price includes a fresh detail and a full tank. Trade value assumes a clean Civic, happy to look at it in person.",
      status, picked_at: status === "picked" ? raw("now() - interval '6 hours'") : null };
  };
  out += insert("public.offers", [
    offerFor(demoCars[1], "active", "00000000-0000-4000-8000-0000000f0001"),
    offerFor(demoCars[2], "picked", "00000000-0000-4000-8000-0000000f0002"),
  ]);
  const conversationId = "00000000-0000-4000-8000-0000000c0001";
  out += insert("public.conversations", [{ id: conversationId, interest_id: interestIds[2], buyer_id: BUYER_ID, dealership_id: demoDealerId, last_message_at: raw("now() - interval '2 hours'") }]);
  out += insert("public.messages", [
    { conversation_id: conversationId, sender_id: null, sender_role: "system", kind: "system", body: "Offer picked. Chat is open.", created_at: raw("now() - interval '6 hours'") },
    { conversation_id: conversationId, sender_id: DEMO_USERS[1].id, sender_role: "dealer", kind: "text", body: "Hi Jordan, thanks for picking our offer! Saturday 10am works great for a test drive. Want me to have it pulled up front?", created_at: raw("now() - interval '5 hours'") },
    { conversation_id: conversationId, sender_id: BUYER_ID, sender_role: "buyer", kind: "text", body: "Yes please. I'll bring the Civic so you can look at the trade.", created_at: raw("now() - interval '2 hours'") },
  ]);
  out += insert("public.notifications", [
    { user_id: BUYER_ID, kind: "new_offer", title: "You have an offer", body: `Out-the-door offer on the ${demoCars[1].row.year} ${demoCars[1].row.make} ${demoCars[1].row.model}`, url: `/offers#${interestIds[1]}` },
  ]);
  return out;
}

// Assemble ----------------------------------------------------------------------
function configSql(config: AppConfig): string {
  return insert("public.app_config", (Object.keys(config) as (keyof AppConfig)[]).map((key) => ({
    key, value: json(config[key]), description: CONFIG_DESCRIPTIONS[key],
  })));
}

function main() {
  const parts: string[] = [];
  parts.push(`-- Generated by scripts/fixtures/generate.ts. Do not edit by hand; run \`npm run fixtures\`.
-- 300 synthetic Nashville-area cars with fictional dealers, for local development and demos.
`);
  parts.push(insert("public.zip_codes", ZIPS.map((z) => ({ zip: z.zip, city: z.city, state: "TN", lat: z.lat, lng: z.lng }))));
  parts.push(insert("public.markets", [{ id: "nashville", name: "Nashville metro", center_zip: "37203", radius_mi: 60, is_active: true, priority: 1 }]));
  parts.push(configSql(DEFAULT_CONFIG));
  parts.push(insert("public.dealerships", DEALERS.map((d, i) => ({
    id: dealerIds[i], name: d.name, slug: d.slug, address: d.address, city: d.city, state: "TN", zip: d.zip,
    lat: d.lat, lng: d.lng, phone: `615-555-${String(100 + i).padStart(4, "0")}`, website: `https://example.com/dealers/${d.slug}`,
    market_id: "nashville", lead_channel: d.leadChannel, verified_at: d.leadChannel === "none" ? null : raw("now() - interval '30 days'"),
    claimed_at: d.leadChannel === "inbox" ? raw("now() - interval '30 days'") : null,
    response_time_minutes: d.responseMinutes, rating: d.rating, review_count: d.rating ? int(12, 240) : 0, doc_fee: d.docFee,
    no_haggle: d.noHaggle ?? false, home_delivery: d.homeDelivery ?? false, at_home_test_drive: d.atHomeTestDrive ?? false,
    buy_online: d.buyOnline ?? false,
  }))));
  parts.push(insert("public.dealership_private", DEALERS.map((d, i) => ({
    dealership_id: dealerIds[i],
    lead_email: d.leadChannel === "none" ? null : `leads+${d.slug}@example.com`,
    lead_email_verified_at: d.leadChannel === "none" ? null : raw("now() - interval '30 days'"),
  }))));
  parts.push(insert("public.listings", [...listings.map((g) => g.row), ...duplicates]));
  parts.push(insert("public.listing_photos", listings.flatMap((g) => g.photos.map((url, position) => ({ listing_id: g.row.id as string, url, position })))));
  parts.push(insert("public.listing_embeddings", listings.map((g) => ({
    listing_id: g.row.id as string, model: "fixture-style-v1", embedding: raw(`'[${g.embedding.join(",")}]'::extensions.vector`),
  }))));
  parts.push(insert("public.listing_price_changes", listings.filter((g) => g.priceDrop).map((g) => ({
    listing_id: g.row.id as string, old_price: g.priceDrop!.old, new_price: g.row.price as number,
    changed_at: raw(`now() - interval '${g.priceDrop!.daysAgo} days'`),
  }))));
  parts.push(demoUsersSql());
  parts.push(demoBuyerSql());
  parts.push(`insert into public.ingest_runs (market_id, source, status, stats, finished_at)
values ('nashville', 'fixture', 'succeeded', '{"listings": ${LISTING_COUNT}, "duplicates": ${duplicates.length}}', now());
`);
  writeFileSync("supabase/seed.sql", parts.join("\n"));
  const counts = listings.reduce<Record<string, number>>((acc, g) => {
    acc[g.row.body_style as string] = (acc[g.row.body_style as string] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`Wrote supabase/seed.sql: ${listings.length} listings (+${duplicates.length} duplicate VINs)`, counts);
}

main();
