import { z } from "zod";
import { ApiError, apiDealer, json, readJson, route } from "@/lib/server/api";
import { importDealerFeed, isPublicHttpsUrl } from "@/lib/server/dealer-feed";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

/**
 * Upload a CSV inventory feed (multipart "file", optional "replace"), or
 * save a feed URL for the daily pull (JSON {url, enabled}).
 */
export const POST = route(async (req: Request) => {
  const { dealership } = await apiDealer();
  const admin = createAdminClient();
  const type = req.headers.get("content-type") ?? "";

  if (type.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "Attach a CSV file.");
    if (file.size > 10 * 1024 * 1024) throw new ApiError(413, "Feeds are limited to 10 MB.");
    const result = await importDealerFeed(admin, dealership, await file.text(), { replace: form.get("replace") !== "false" });
    return json(result);
  }

  const parsed = z.object({ url: z.string().max(500).nullable(), enabled: z.boolean() }).safeParse(await readJson(req));
  if (!parsed.success) throw new ApiError(400, "Invalid feed settings.");
  const { url, enabled } = parsed.data;
  if (url && !isPublicHttpsUrl(url)) throw new ApiError(400, "Use a public https:// URL.");
  await admin.from("dealer_feeds").upsert({ dealership_id: dealership.id, url: url || null, enabled: Boolean(url) && enabled });
  return json({ ok: true });
});
