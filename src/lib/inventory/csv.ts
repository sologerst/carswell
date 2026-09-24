// Dealer CSV feeds (Phase 2): RFC 4180 parsing and column mapping onto
// CarSwipe listing fields. Pure functions so they are easy to test.

import { extractFeaturesFromText } from "../criteria/features";
import type { BodyStyle, Condition, Drivetrain, FuelType } from "../types";
import { extractVin, isValidVin, withCheckDigit } from "../vin";
import { colorFamily, normalizeBody, normalizeDrive, normalizeFuel } from "./normalize";

/** Parse CSV text (quoted fields, escaped quotes, CRLF, BOM). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"' && field === "") quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

// Accepted header names per field (lowercased, non-alphanumerics removed).
const ALIASES: Record<string, string[]> = {
  vin: ["vin", "vinnumber", "vehicleidentificationnumber"],
  year: ["year", "modelyear", "yr"],
  make: ["make", "manufacturer"],
  model: ["model"],
  trim: ["trim", "trimlevel", "series"],
  price: ["price", "sellingprice", "internetprice", "saleprice", "askingprice", "listprice"],
  msrp: ["msrp", "retailprice"],
  miles: ["miles", "mileage", "odometer", "odo"],
  condition: ["condition", "type", "newused", "stocktype", "status"],
  body: ["body", "bodystyle", "bodytype", "style"],
  exterior_color: ["exteriorcolor", "color", "extcolor", "exterior"],
  interior_color: ["interiorcolor", "intcolor", "interior"],
  fuel: ["fuel", "fueltype"],
  drivetrain: ["drivetrain", "drive", "drivetype", "drivetraintype"],
  transmission: ["transmission", "trans"],
  engine: ["engine", "enginedescription"],
  seats: ["seats", "seating", "passengercapacity"],
  photos: ["photos", "photourls", "images", "imageurls", "imagelist", "pictures"],
  stock: ["stock", "stocknumber", "stockno", "stock"],
  description: ["description", "comments", "sellernotes", "dealercomments", "notes"],
  features: ["features", "options", "equipment", "optionlist"],
  url: ["url", "vdpurl", "link", "vehicleurl"],
};

export interface FeedRow {
  vin: string;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  price: number;
  msrp: number | null;
  miles: number;
  condition: Condition;
  body_style: BodyStyle | null;
  exterior_color: string | null;
  exterior_color_family: string | null;
  interior_color: string | null;
  fuel_type: FuelType;
  drivetrain: Drivetrain | null;
  transmission: "automatic" | "manual" | "cvt" | null;
  engine: string | null;
  seats: number | null;
  photos: string[];
  stock_number: string | null;
  description: string | null;
  features: string[];
  source_url: string | null;
}

export interface FeedError { line: number; vin: string | null; error: string }

const key = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");
const money = (s: string | undefined) => {
  const n = Number((s ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
};

function conditionOf(s: string | undefined): Condition {
  const v = (s ?? "").toLowerCase();
  if (/cert|cpo/.test(v)) return "cpo";
  if (/^n(ew)?$/.test(v.trim()) || v.trim() === "new") return "new";
  return "used";
}

function transmissionOf(s: string | undefined): FeedRow["transmission"] {
  const v = (s ?? "").toLowerCase();
  if (!v) return null;
  if (/cvt|continuously/.test(v)) return "cvt";
  if (/manual|stick|mt\b/.test(v)) return "manual";
  return "automatic";
}

/** Map parsed CSV rows (first row = headers) onto feed rows, with per-line errors. */
export function mapFeedRows(table: string[][], maxRows = 5000): { rows: FeedRow[]; errors: FeedError[]; unmapped: string[] } {
  const [header, ...body] = table;
  if (!header) return { rows: [], errors: [{ line: 1, vin: null, error: "The file is empty." }], unmapped: [] };
  const index: Record<string, number> = {};
  const unmapped: string[] = [];
  header.forEach((h, i) => {
    const k = key(h);
    const field = Object.entries(ALIASES).find(([, names]) => names.includes(k))?.[0];
    if (field && index[field] === undefined) index[field] = i;
    else if (!field && h.trim()) unmapped.push(h.trim());
  });
  if (index.vin === undefined || index.price === undefined) {
    return { rows: [], errors: [{ line: 1, vin: null, error: "The file needs at least VIN and price columns." }], unmapped };
  }

  const rows: FeedRow[] = [];
  const errors: FeedError[] = [];
  const seen = new Set<string>();
  body.slice(0, maxRows).forEach((cells, i) => {
    const line = i + 2;
    const get = (f: string) => (index[f] === undefined ? undefined : cells[index[f]]?.trim() || undefined);
    const rawVin = get("vin") ?? "";
    const vin = isValidVin(rawVin) ? rawVin.toUpperCase() : extractVin(rawVin);
    if (!vin) return errors.push({ line, vin: rawVin || null, error: "Invalid VIN (check digit)." });
    if (seen.has(vin)) return errors.push({ line, vin, error: "Duplicate VIN in this file." });
    const price = money(get("price"));
    if (!price) return errors.push({ line, vin, error: "Missing price." });
    seen.add(vin);
    const year = Number(get("year")) || null;
    const seats = Number(get("seats")) || null;
    const description = get("description") ?? null;
    const featureText = [get("features"), description].filter(Boolean).join(" \n ");
    const photos = (get("photos") ?? "").split(/[|,\s]+/).map((u) => u.trim()).filter((u) => /^https:\/\/\S+$/i.test(u)).slice(0, 40);
    const url = get("url");
    rows.push({
      vin,
      year: year && year >= 1981 && year <= 2100 ? year : null,
      make: get("make") ?? null,
      model: get("model") ?? null,
      trim: get("trim") ?? null,
      price,
      msrp: money(get("msrp")),
      miles: Math.max(0, Math.round(Number((get("miles") ?? "0").replace(/[^\d.]/g, "")) || 0)),
      condition: conditionOf(get("condition")),
      body_style: normalizeBody(get("body"), seats),
      exterior_color: get("exterior_color") ?? null,
      exterior_color_family: colorFamily(get("exterior_color")),
      interior_color: get("interior_color") ?? null,
      fuel_type: normalizeFuel(get("fuel")),
      drivetrain: normalizeDrive(get("drivetrain")),
      transmission: transmissionOf(get("transmission")),
      engine: get("engine") ?? null,
      seats,
      photos,
      stock_number: get("stock") ?? null,
      description,
      features: featureText ? extractFeaturesFromText(featureText) : [],
      source_url: url && /^https?:\/\//i.test(url) ? url : null,
    });
  });
  if (body.length > maxRows) errors.push({ line: maxRows + 2, vin: null, error: `Only the first ${maxRows} rows were read.` });
  return { rows, errors, unmapped };
}

export const SAMPLE_FEED_CSV = `vin,year,make,model,trim,price,miles,condition,body,exterior_color,photos,stock,description
${withCheckDigit("5YJ3E1EA0KF317000")},2019,Tesla,Model 3,Standard Range Plus,27995,41200,used,Sedan,Pearl White,https://example.com/p/1.jpg|https://example.com/p/2.jpg,T1234,"Autopilot, heated seats, one owner"
`;
