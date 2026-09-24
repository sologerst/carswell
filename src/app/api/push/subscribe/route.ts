import { z } from "zod";
import { ApiError, apiProfile, json, readJson, route } from "@/lib/server/api";

const Sub = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
});

export const POST = route(async (req: Request) => {
  const { supabase, profile } = await apiProfile();
  const parsed = Sub.safeParse(await readJson(req));
  if (!parsed.success) throw new ApiError(400, "Invalid push subscription.");
  const { error } = await supabase.from("push_subscriptions").upsert({
    user_id: profile.id,
    endpoint: parsed.data.endpoint,
    p256dh: parsed.data.keys.p256dh,
    auth: parsed.data.keys.auth,
    user_agent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
  }, { onConflict: "endpoint" });
  if (error) throw new ApiError(400, error.message);
  return json({ ok: true });
});

export const DELETE = route(async (req: Request) => {
  const { supabase, profile } = await apiProfile();
  const { endpoint } = (await readJson<{ endpoint?: string }>(req)) ?? {};
  if (endpoint) await supabase.from("push_subscriptions").delete().eq("user_id", profile.id).eq("endpoint", endpoint);
  return json({ ok: true });
});
