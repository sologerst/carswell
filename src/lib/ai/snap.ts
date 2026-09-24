import "server-only";

import { z } from "zod";
import { FEATURE_KEYS, extractFeaturesFromText, featureLabel } from "../criteria/features";
import { aiJson, type AiJsonOptions } from "./client";

// Snap-to-list (Phase 3): seller photos + VIN decode -> listing copy, feature
// chips, photo feedback and visible damage notes. The seller edits everything
// before publishing; nothing is posted automatically.

export interface SnapInput {
  title: string;
  miles: number;
  decode: Record<string, string> | null;
  sellerNotes: string;
  /** Base64 JPEGs (already resized), with their photo index. */
  images: { index: number; base64: string }[];
}

const SnapSchema = z.object({
  description: z.string(),
  features: z.array(z.string()),
  exterior_color: z.string().nullable(),
  damage_notes: z.array(z.object({ photo: z.number().int(), note: z.string() })),
  photo_feedback: z.array(z.object({ photo: z.number().int(), issue: z.string() })),
  missing_shots: z.array(z.string()),
});

export type SnapResult = z.infer<typeof SnapSchema> & { source: "ai" | "template"; model: string | null };

const SHOTS = ["Front three-quarter", "Rear three-quarter", "Driver side", "Interior dashboard", "Front seats", "Rear seats", "Odometer", "Tires", "Engine bay", "Cargo area"];

export function templateSnap(input: SnapInput): SnapResult {
  const d = input.decode ?? {};
  const bits = [
    `${input.title} with ${input.miles.toLocaleString("en-US")} miles.`,
    d["Drive Type"] ? `${d["Drive Type"]}.` : null,
    d["Engine Number of Cylinders"] ? `${d["Engine Number of Cylinders"]}-cylinder${d["Displacement (L)"] ? ` ${Number(d["Displacement (L)"]).toFixed(1)}L` : ""} engine.` : null,
    input.sellerNotes.trim() || null,
    "Private sale. Happy to meet in a public place and welcome a pre-purchase inspection.",
  ].filter(Boolean);
  return {
    description: bits.join(" "),
    features: extractFeaturesFromText(input.sellerNotes),
    exterior_color: null,
    damage_notes: [],
    photo_feedback: [],
    missing_shots: input.images.length < 6 ? SHOTS.slice(input.images.length, 6) : [],
    source: "template",
    model: null,
  };
}

export async function aiSnap(input: SnapInput, usage: AiJsonOptions<typeof SnapSchema>["usage"]): Promise<SnapResult> {
  const fallback = templateSnap(input);
  if (!input.images.length) return fallback;
  const res = await aiJson({
    feature: "snap_to_list",
    tier: "fast",
    maxTokens: 1800,
    system: `You help a private seller write an honest used-car listing from their photos.
Rules:
- Describe only what the photos show, the VIN decode says, or the seller's notes state. Never invent history (accidents, owners, service) or claims you can't see.
- description: 60-120 words, plain and friendly, no emoji, no contact details, no prices.
- features: canonical keys only, from this list, and only when clearly visible or stated: ${FEATURE_KEYS.join(", ")}.
- damage_notes: visible scratches, dents, curb rash, cracked glass, worn seats, warning lights; cite the photo number.
- photo_feedback: blurry, dark, cluttered, or plate/VIN plate readable (privacy); cite the photo number.
- missing_shots: which standard shots are missing (${SHOTS.join(", ")}).`,
    schema: SnapSchema,
    usage,
    messages: [{
      role: "user",
      content: [
        ...input.images.flatMap((img) => [
          { type: "text" as const, text: `Photo ${img.index + 1}:` },
          { type: "image" as const, source: { type: "base64" as const, media_type: "image/jpeg" as const, data: img.base64 } },
        ]),
        { type: "text" as const, text: `Car: ${input.title}, ${input.miles} miles.\nVIN decode: ${JSON.stringify(input.decode ?? {})}\nSeller notes: ${input.sellerNotes || "none"}` },
      ],
    }],
  });
  if (!res) return fallback;
  const known = new Set(FEATURE_KEYS);
  return {
    ...res.data,
    features: [...new Set([...res.data.features.filter((f) => known.has(f)), ...fallback.features])],
    // Photo numbers are 1-based for people; keep them that way in notes.
    source: "ai",
    model: res.model,
  };
}

export const featureChips = (keys: string[]) => keys.map((k) => ({ key: k, label: featureLabel(k) }));
