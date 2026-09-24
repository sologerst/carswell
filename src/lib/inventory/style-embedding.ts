// Attribute-only "style fingerprint": the fallback when no image-embedding
// provider is configured. Same 16 dimensions as the fixture embeddings so
// taste vectors stay comparable. Replace with photo embeddings once the
// provider is chosen (open question in the spec).

import type { BodyStyle } from "../types";

const BODY_TRAITS: Record<BodyStyle, [number, number, number, number, number, number]> = {
  // boxy, sporty, rugged, luxe, family, eco
  sedan: [0.2, 0.45, 0.05, 0.35, 0.45, 0.55],
  hatchback: [0.15, 0.55, 0.05, 0.25, 0.3, 0.7],
  coupe: [0.2, 0.95, 0.1, 0.45, 0.05, 0.15],
  convertible: [0.15, 0.9, 0.05, 0.55, 0.05, 0.15],
  wagon: [0.5, 0.25, 0.6, 0.3, 0.65, 0.5],
  compact_suv: [0.45, 0.35, 0.3, 0.35, 0.6, 0.5],
  midsize_suv: [0.65, 0.3, 0.6, 0.45, 0.6, 0.25],
  three_row_suv: [0.75, 0.2, 0.4, 0.5, 0.95, 0.2],
  minivan: [0.8, 0.05, 0.05, 0.35, 1, 0.4],
  pickup: [0.8, 0.25, 0.9, 0.35, 0.45, 0.05],
};
const LUXE_MAKES = new Set(["BMW", "Mercedes-Benz", "Audi", "Lexus", "Acura", "Volvo", "Genesis", "Cadillac", "Lincoln", "Porsche", "Land Rover"]);
const HUE: Record<string, number> = { blue: 220, red: 355, green: 110, brown: 35, orange: 22 };
const LIGHT: Record<string, number> = { white: 1, silver: 0.75, gray: 0.45, black: 0, blue: 0.35, red: 0.4, green: 0.4, brown: 0.55, orange: 0.6 };

export function styleEmbedding(car: {
  make: string; body_style: BodyStyle; fuel_type: string; exterior_color_family: string | null;
  trim_level: string | null; features: string[]; length_in?: number | null;
}): number[] {
  const t = BODY_TRAITS[car.body_style];
  const trim = car.trim_level ?? "";
  const sporty = /Sport|GT|N Line|RST|TRD|XSE|Si|AMG|M\d|Type S|F Sport|Performance/.test(trim) ? 1 : 0;
  const rugged = /TRD|Rubicon|TrailSport|Trailhawk|Wilderness|Badlands|PRO-4X|ZR2|AT4|X-Pro|Trail Boss|Z71|Rebel/.test(trim) || car.features.includes("off_road_package") ? 1 : 0;
  const luxe = LUXE_MAKES.has(car.make) ? 0.35 : 0;
  const tier = Math.min(3, ["leather", "cooled_seats", "premium_audio", "panoramic_roof", "camera_360"].filter((f) => car.features.includes(f)).length);
  const eco = ["hybrid", "plugin_hybrid", "electric"].includes(car.fuel_type) ? 0.35 : 0;
  const fam = car.exterior_color_family ?? "gray";
  const hue = HUE[fam];
  const v = [
    t[0] * 1.2,
    Math.min(1, t[1] + 0.2 * sporty) * 1.2,
    Math.min(1, t[2] + 0.2 * rugged) * 1.2,
    Math.min(1, t[3] + luxe + 0.07 * tier) * 1.2,
    t[4],
    Math.min(1, t[5] + eco) * 0.9,
    Math.min(1, Math.max(0, ((car.length_in ?? 185) - 165) / 70)) * 0.8,
    car.body_style === "pickup" ? 0.8 : 0,
    ["sedan", "coupe", "hatchback", "convertible"].includes(car.body_style) ? 0.7 : 0,
    (LIGHT[fam] ?? 0.5) * 0.6,
    hue === undefined ? 0 : Math.cos((hue * Math.PI) / 180) * 0.5,
    hue === undefined ? 0 : Math.sin((hue * Math.PI) / 180) * 0.5,
    hue === undefined ? 0 : 0.5,
    (tier / 3) * 0.5,
    sporty * 0.4,
    0,
  ];
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => Number((x / norm).toFixed(4)));
}
