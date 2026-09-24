import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const parse = vi.fn();
vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error { status = 500; }
  class RateLimitError extends APIError { status = 429; }
  class Anthropic {
    static APIError = APIError;
    static RateLimitError = RateLimitError;
    beta = { messages: { parse } };
  }
  return { default: Anthropic };
});

const Schema = z.object({ answer: z.string() });

function usageStore(spent: number) {
  const insert = vi.fn(async () => ({ error: null }));
  const store = {
    from: () => ({
      select: () => ({ eq: () => ({ gte: async () => ({ data: [{ cost_usd: spent }] }) }) }),
      insert,
    }),
  };
  return { store, insert };
}

async function load(env: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import("@/lib/ai/client");
}

describe("aiJson", () => {
  beforeEach(() => {
    parse.mockReset();
    vi.unstubAllEnvs();
  });

  it("returns null (template fallback) when no API key is set", async () => {
    const { aiJson } = await load({ ANTHROPIC_API_KEY: "" });
    expect(await aiJson({ feature: "t", tier: "frontier", system: "s", messages: [], schema: Schema })).toBeNull();
    expect(parse).not.toHaveBeenCalled();
  });

  it("uses the frontier model with effort and server-side refusal fallback", async () => {
    parse.mockResolvedValue({ model: "claude-opus-5", stop_reason: "end_turn", parsed_output: { answer: "hi" }, usage: { input_tokens: 1000, output_tokens: 100 } });
    const { aiJson } = await load({ ANTHROPIC_API_KEY: "sk-test", AI_MODEL_FRONTIER: "claude-opus-5" });
    const { store, insert } = usageStore(0);
    const res = await aiJson({ feature: "brief", tier: "frontier", effort: "low", system: "s", messages: [{ role: "user", content: "x" }], schema: Schema, usage: { store: store as never, userId: "u1", dailyBudgetUsd: 1 } });
    expect(res?.data).toEqual({ answer: "hi" });
    const params = parse.mock.calls[0][0];
    expect(params.model).toBe("claude-opus-5");
    expect(params.output_config.effort).toBe("low");
    expect(params.fallbacks).toBe("default");
    expect(params.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "u1", feature: "brief", cost_usd: 0.0075 }));
  });

  it("sends no effort setting to Haiku 4.5", async () => {
    parse.mockResolvedValue({ model: "claude-haiku-4-5", stop_reason: "end_turn", parsed_output: { answer: "ok" }, usage: { input_tokens: 10, output_tokens: 10 } });
    const { aiJson } = await load({ ANTHROPIC_API_KEY: "sk-test", AI_MODEL_FAST: "claude-haiku-4-5" });
    await aiJson({ feature: "lead_summary", tier: "fast", system: "s", messages: [], schema: Schema });
    const params = parse.mock.calls[0][0];
    expect(params.model).toBe("claude-haiku-4-5");
    expect(params.output_config.effort).toBeUndefined();
    expect(params.fallbacks).toBeUndefined();
  });

  it("falls back when the daily budget is spent", async () => {
    const { aiJson } = await load({ ANTHROPIC_API_KEY: "sk-test" });
    const { store } = usageStore(0.3);
    expect(await aiJson({ feature: "brief", tier: "frontier", system: "s", messages: [], schema: Schema, usage: { store: store as never, userId: "u1", dailyBudgetUsd: 0.25 } })).toBeNull();
    expect(parse).not.toHaveBeenCalled();
  });

  it("falls back on a refusal or an API error", async () => {
    const { aiJson } = await load({ ANTHROPIC_API_KEY: "sk-test" });
    parse.mockResolvedValueOnce({ model: "claude-opus-5", stop_reason: "refusal", parsed_output: null, usage: { input_tokens: 5, output_tokens: 0 } });
    expect(await aiJson({ feature: "t", tier: "frontier", system: "s", messages: [], schema: Schema })).toBeNull();
    parse.mockRejectedValueOnce(new Error("network"));
    expect(await aiJson({ feature: "t", tier: "frontier", system: "s", messages: [], schema: Schema })).toBeNull();
  });
});
