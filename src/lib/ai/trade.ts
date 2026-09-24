import "server-only";

import { z } from "zod";
import { aiJson, type AiJsonOptions } from "./client";

const Schema = z.object({
  condition: z.enum(["excellent", "good", "fair", "rough"]),
  notes: z.array(z.string()),
});

/** Visible-condition notes on trade-in photos (fast model). Null = no AI. */
export async function aiTradeNotes(title: string, images: string[], usage: AiJsonOptions<typeof Schema>["usage"]) {
  if (!images.length) return null;
  const res = await aiJson({
    feature: "trade_photos",
    tier: "fast",
    maxTokens: 800,
    system: "You look at photos of a used car a buyer wants to trade in. Report only visible condition: paint, dents, curb rash, tire tread, interior wear, warning lights. Pick an overall condition (excellent, good, fair, rough). Up to 5 short notes. Never guess mechanical condition.",
    schema: Schema,
    usage,
    messages: [{ role: "user", content: [
      ...images.slice(0, 4).map((data) => ({ type: "image" as const, source: { type: "base64" as const, media_type: "image/jpeg" as const, data } })),
      { type: "text" as const, text: `Trade-in: ${title}` },
    ] }],
  });
  return res?.data ?? null;
}
