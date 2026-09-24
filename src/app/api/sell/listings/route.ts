import { z } from "zod";
import { BODY_STYLES } from "@/lib/types";
import { ApiError, apiProfile, json, readJson, route } from "@/lib/server/api";
import { loadConfig } from "@/lib/server/data";
import { createDraft } from "@/lib/server/sell";
import { createAdminClient } from "@/lib/supabase/admin";

const Body = z.object({
  vin: z.string().trim().length(17),
  year: z.number().int().min(1981).max(new Date().getFullYear() + 1),
  make: z.string().trim().min(1).max(40),
  model: z.string().trim().min(1).max(60),
  trim: z.string().trim().max(60).nullish(),
  miles: z.number().int().min(0).max(999_999),
  body_style: z.enum(BODY_STYLES.map((b) => b.key) as [string, ...string[]]),
  fuel_type: z.enum(["gas", "diesel", "hybrid", "plugin_hybrid", "electric"]).optional(),
  drivetrain: z.enum(["fwd", "rwd", "awd", "4wd"]).nullish(),
  transmission: z.enum(["automatic", "manual", "cvt"]).nullish(),
  exterior_color: z.string().trim().max(40).nullish(),
  zip: z.string().regex(/^\d{5}$/),
});

/** Start a private listing (a draft only the seller can see). */
export const POST = route(async (req: Request) => {
  const { supabase, profile } = await apiProfile();
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new ApiError(400, "Check the car details and try again.");
  const config = await loadConfig(supabase);
  const id = await createDraft(createAdminClient(), profile, parsed.data as Parameters<typeof createDraft>[2], config);
  return json({ id });
});
