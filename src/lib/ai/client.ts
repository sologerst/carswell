import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env, features } from "../env";
import type { Database } from "../supabase/database.types";

// Every AI capability has a non-AI fallback, a cost cap and never sends
// anything on the buyer's behalf. This module returns null whenever the app
// should fall back: no key, over the daily budget, a refusal, or an error.

export type ModelTier = "frontier" | "fast";
export type Effort = "low" | "medium" | "high";

// USD per million tokens [input, output].
const PRICES: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-opus-5": [5, 25],
  "claude-sonnet-5": [2, 10],
  "claude-haiku-4-5": [1, 5],
  "claude-fable-5-1": [10, 50],
};

export function modelFor(tier: ModelTier): string {
  return tier === "frontier" ? env.aiModelFrontier : env.aiModelFast;
}

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const key = Object.keys(PRICES).find((k) => model.startsWith(k)) ?? "claude-opus-5";
  const [inp, out] = PRICES[key];
  return (inputTokens * inp + outputTokens * out) / 1_000_000;
}

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!features.ai) return null;
  client ??= new Anthropic({ apiKey: env.anthropicApiKey, timeout: 45_000, maxRetries: 1 });
  return client;
}

/** Any Supabase client (user-scoped or admin) used for budget accounting. */
export type UsageStore = SupabaseClient<Database>;

export async function spentToday(store: UsageStore, userId: string): Promise<number> {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const { data } = await store.from("ai_usage").select("cost_usd").eq("user_id", userId).gte("created_at", since.toISOString());
  return (data ?? []).reduce((s, r) => s + Number(r.cost_usd), 0);
}

export interface AiJsonOptions<S extends z.ZodType> {
  feature: string;
  tier: ModelTier;
  system: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  schema: S;
  maxTokens?: number;
  effort?: Effort;
  /** Per-user budget accounting; omit for system jobs. */
  usage?: { store: UsageStore; userId: string | null; dailyBudgetUsd: number };
}

export interface AiResult<T> {
  data: T;
  model: string;
  costUsd: number;
}

/** Structured JSON from Claude, validated against a Zod schema. Null = use the fallback. */
export async function aiJson<S extends z.ZodType>(opts: AiJsonOptions<S>): Promise<AiResult<z.infer<S>> | null> {
  const anthropic = getClient();
  if (!anthropic) return null;

  if (opts.usage?.userId) {
    const budget = env.aiDailyBudgetPerUser ?? opts.usage.dailyBudgetUsd;
    if ((await spentToday(opts.usage.store, opts.usage.userId)) >= budget) return null;
  }

  const model = modelFor(opts.tier);
  const isHaiku = model.startsWith("claude-haiku");
  const supportsFallback = model.startsWith("claude-opus-5") || model.startsWith("claude-fable");
  try {
    const response = await anthropic.beta.messages.parse({
      model,
      max_tokens: opts.maxTokens ?? 4000,
      system: opts.system,
      messages: opts.messages,
      output_config: {
        format: betaZodOutputFormat(opts.schema),
        // Haiku 4.5 does not take an effort setting.
        ...(isHaiku ? {} : { effort: opts.effort ?? "low" }),
      },
      // Server-side refusal fallback: a declined request is retried on the
      // model Anthropic recommends for that refusal category.
      ...(supportsFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    });

    const costUsd = estimateCost(response.model ?? model, response.usage.input_tokens, response.usage.output_tokens);
    if (opts.usage) {
      await opts.usage.store.from("ai_usage").insert({
        user_id: opts.usage.userId,
        feature: opts.feature,
        model: response.model ?? model,
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        cost_usd: Number(costUsd.toFixed(5)),
      });
    }
    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens" || !response.parsed_output) return null;
    return { data: response.parsed_output as z.infer<S>, model: response.model ?? model, costUsd };
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) console.warn(`[ai:${opts.feature}] rate limited`);
    else if (error instanceof Anthropic.APIError) console.error(`[ai:${opts.feature}] API error ${error.status}: ${error.message}`);
    else console.error(`[ai:${opts.feature}]`, error);
    return null;
  }
}
