import { z } from "zod";
import { normalizeUsPhone } from "@/lib/phone";
import { ApiError, apiProfile, json, readJson, route } from "@/lib/server/api";
import { checkPhoneVerification, startPhoneVerification } from "@/lib/server/phone";
import { createAdminClient } from "@/lib/supabase/admin";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), phone: z.string().max(30), purpose: z.enum(["profile", "dealership"]), dealershipId: z.string().uuid().optional() }),
  z.object({ action: z.literal("check"), code: z.string().regex(/^\d{4,8}$/), purpose: z.enum(["profile", "dealership"]) }),
]);

/** Phone verification for private sellers (profile) and dealerships. */
export const POST = route(async (req: Request) => {
  const { supabase, profile } = await apiProfile();
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new ApiError(400, "Invalid request.");
  const admin = createAdminClient();
  const body = parsed.data;

  if (body.action === "start") {
    const phone = normalizeUsPhone(body.phone);
    if (!phone) throw new ApiError(400, "Enter a 10-digit US mobile number.");
    if (body.purpose === "dealership") {
      if (!body.dealershipId) throw new ApiError(400, "Which dealership?");
      const { data: member } = await supabase.from("dealership_members").select("role")
        .eq("dealership_id", body.dealershipId).eq("user_id", profile.id).maybeSingle();
      if (member?.role !== "owner") throw new ApiError(403, "Only owners can verify the dealership phone.");
    }
    const res = await startPhoneVerification(admin, { userId: profile.id, phone, purpose: body.purpose, dealershipId: body.dealershipId });
    return json({ ok: true, channel: res.channel });
  }
  const res = await checkPhoneVerification(admin, { userId: profile.id, code: body.code, purpose: body.purpose });
  return json({ ok: true, phone: res.phone, verifiedAt: res.verifiedAt });
});
