// The ~40 canonical feature keys. Listing data (MarketCheck, VIN build data,
// AI enrichment) is normalized onto these keys.

export type FeatureGroup = "safety" | "tech" | "comfort" | "convenience" | "utility";

export interface FeatureDef {
  key: string;
  label: string;
  group: FeatureGroup;
  /** Matched against dealer descriptions by the regex fallback enricher. */
  patterns: RegExp[];
}

export const FEATURE_GROUP_LABELS: Record<FeatureGroup, string> = {
  safety: "Safety",
  tech: "Tech",
  comfort: "Comfort",
  convenience: "Convenience",
  utility: "Utility",
};

export const FEATURES: FeatureDef[] = [
  // Safety
  { key: "adaptive_cruise", label: "Adaptive cruise", group: "safety", patterns: [/adaptive cruise/i, /radar cruise/i, /dynamic radar/i] },
  { key: "blind_spot", label: "Blind-spot monitor", group: "safety", patterns: [/blind[- ]spot/i, /\bBLIS\b/, /\bBSM\b/] },
  { key: "lane_keep", label: "Lane keep assist", group: "safety", patterns: [/lane[- ]keep/i, /lane[- ]departure/i, /lane centering/i] },
  { key: "auto_emergency_braking", label: "Automatic emergency braking", group: "safety", patterns: [/emergency braking/i, /pre-?collision/i, /\bAEB\b/, /forward collision/i] },
  { key: "camera_360", label: "360° camera", group: "safety", patterns: [/360/, /surround view/i, /bird'?s[- ]eye/i, /panoramic view monitor/i] },
  { key: "rear_cross_traffic", label: "Rear cross-traffic alert", group: "safety", patterns: [/cross[- ]traffic/i, /\bRCTA\b/] },
  { key: "backup_camera", label: "Backup camera", group: "safety", patterns: [/back-?up camera/i, /rear-?view camera/i, /reverse camera/i] },
  { key: "parking_sensors", label: "Parking sensors", group: "safety", patterns: [/parking sensors?/i, /park assist/i, /sonar/i] },
  // Tech
  { key: "carplay", label: "Apple CarPlay", group: "tech", patterns: [/car ?play/i] },
  { key: "android_auto", label: "Android Auto", group: "tech", patterns: [/android auto/i] },
  { key: "premium_audio", label: "Premium audio", group: "tech", patterns: [/premium audio/i, /\bJBL\b/, /\bBose\b/i, /Harman|Kardon/i, /Bang ?& ?Olufsen/i, /Mark Levinson/i, /Burmester/i] },
  { key: "head_up_display", label: "Head-up display", group: "tech", patterns: [/head[- ]up display/i, /\bHUD\b/] },
  { key: "wireless_charging", label: "Wireless charging", group: "tech", patterns: [/wireless (phone )?charg/i, /qi charg/i] },
  { key: "navigation", label: "Built-in navigation", group: "tech", patterns: [/navigation/i, /\bnav\b/i, /\bGPS\b/] },
  { key: "bluetooth", label: "Bluetooth", group: "tech", patterns: [/bluetooth/i] },
  // Comfort
  { key: "heated_seats", label: "Heated seats", group: "comfort", patterns: [/heated (front )?seats?/i, /seat heaters?/i] },
  { key: "cooled_seats", label: "Cooled seats", group: "comfort", patterns: [/(cooled|ventilated) seats?/i] },
  { key: "heated_wheel", label: "Heated steering wheel", group: "comfort", patterns: [/heated (steering )?wheel/i] },
  { key: "leather", label: "Leather seats", group: "comfort", patterns: [/leather/i] },
  { key: "sunroof", label: "Sunroof", group: "comfort", patterns: [/sun ?roof/i, /moon ?roof/i] },
  { key: "panoramic_roof", label: "Panoramic roof", group: "comfort", patterns: [/panoramic (sun|moon|glass )?roof/i, /pano roof/i] },
  { key: "memory_seats", label: "Memory seats", group: "comfort", patterns: [/memory seat/i, /driver memory/i] },
  { key: "power_seats", label: "Power seats", group: "comfort", patterns: [/power (driver )?seats?/i, /power-adjustable/i] },
  { key: "dual_zone_climate", label: "Dual-zone climate", group: "comfort", patterns: [/dual[- ]zone/i] },
  { key: "tri_zone_climate", label: "Tri-zone climate", group: "comfort", patterns: [/tri[- ]zone/i, /three[- ]zone/i] },
  // Convenience
  { key: "remote_start", label: "Remote start", group: "convenience", patterns: [/remote (engine )?start/i] },
  { key: "power_liftgate", label: "Power liftgate", group: "convenience", patterns: [/power (lift|tail)gate/i, /hands[- ]free (lift|tail)gate/i] },
  { key: "keyless_entry", label: "Keyless entry", group: "convenience", patterns: [/keyless/i, /smart key/i, /push[- ]button start/i] },
  { key: "auto_dimming_mirror", label: "Auto-dimming mirror", group: "convenience", patterns: [/auto[- ]dimming/i] },
  { key: "rain_sensing_wipers", label: "Rain-sensing wipers", group: "convenience", patterns: [/rain[- ]sensing/i] },
  { key: "third_row_seat", label: "Third-row seat", group: "convenience", patterns: [/third[- ]row/i, /3rd row/i] },
  // Utility
  { key: "tow_package", label: "Tow package", group: "utility", patterns: [/tow(ing)? (package|pkg|prep)/i, /trailer hitch/i, /tow hitch/i] },
  { key: "roof_rails", label: "Roof rails", group: "utility", patterns: [/roof rails?/i, /roof rack/i] },
  { key: "bed_liner", label: "Bed liner", group: "utility", patterns: [/bed ?liner/i, /spray-?in liner/i] },
  { key: "running_boards", label: "Running boards", group: "utility", patterns: [/running boards?/i, /side steps?/i, /step bars?/i] },
  { key: "skid_plates", label: "Skid plates", group: "utility", patterns: [/skid plates?/i] },
  { key: "all_weather_mats", label: "All-weather mats", group: "utility", patterns: [/all[- ]weather (floor )?mats/i, /weathertech/i] },
  { key: "washable_interior", label: "Washable interior", group: "utility", patterns: [/washable/i, /rubber floor/i, /water-?resistant (seats|upholstery)/i] },
  { key: "off_road_package", label: "Off-road package", group: "utility", patterns: [/off-?road package/i, /\bTRD Off-?Road\b/i, /\bRubicon\b/, /\bTrailSport\b/, /\bFX4\b/, /\bZ71\b/, /\bWilderness\b/] },
];

export const FEATURE_KEYS = FEATURES.map((f) => f.key);
export const FEATURE_BY_KEY: Record<string, FeatureDef> = Object.fromEntries(FEATURES.map((f) => [f.key, f]));

export function featureLabel(key: string): string {
  return FEATURE_BY_KEY[key]?.label ?? key.replace(/_/g, " ");
}

/** Regex fallback for AI listing enrichment: canonical keys found in free text. */
export function extractFeaturesFromText(text: string): string[] {
  if (!text) return [];
  const found = new Set<string>();
  for (const f of FEATURES) {
    if (f.patterns.some((p) => p.test(text))) found.add(f.key);
  }
  // A panoramic roof is also a sunroof.
  if (found.has("panoramic_roof")) found.add("sunroof");
  return [...found].sort();
}
