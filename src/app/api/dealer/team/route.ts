import { z } from "zod";
import { env } from "@/lib/env";
import { ApiError, apiDealer, json, readJson, route } from "@/lib/server/api";
import { sendEmail } from "@/lib/server/email";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("invite"), email: z.string().email().max(200), role: z.enum(["owner", "staff"]) }),
  z.object({ action: z.literal("remove"), userId: z.string().uuid() }),
]);

/** Team management: invite by email, remove a member (owners only). */
export const POST = route(async (req: Request) => {
  const { supabase, profile, dealership } = await apiDealer({ owner: true });
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new ApiError(400, "Invalid request.");
  const body = parsed.data;

  if (body.action === "invite") {
    const { data: token, error } = await supabase.rpc("create_dealer_invite", { p_dealership_id: dealership.id, p_email: body.email, p_role: body.role });
    if (error) throw new ApiError(400, error.message);
    const url = `${env.siteUrl}/join/invite/${token}`;
    await sendEmail({
      kind: "dealer_invite",
      to: body.email,
      subject: `${profile.first_name ?? "A teammate"} invited you to ${dealership.name} on ${env.appName}`,
      text: `Join ${dealership.name}'s lead inbox on ${env.appName}: ${url}\nThe link expires in 14 days and works only for ${body.email}.`,
      html: `<p>Join <strong>${dealership.name.replace(/</g, "&lt;")}</strong>'s lead inbox on ${env.appName}.</p><p><a href="${url}">Accept the invite</a></p><p style="color:#8a93ad;font-size:12px">The link expires in 14 days and works only for ${body.email}.</p>`,
      meta: { dealership_id: dealership.id, invite_url: url },
    });
    return json({ ok: true });
  }
  if (body.userId === profile.id) throw new ApiError(400, "You can't remove yourself.");
  const { error } = await supabase.rpc("remove_dealer_member", { p_dealership_id: dealership.id, p_user_id: body.userId });
  if (error) throw new ApiError(400, error.message);
  return json({ ok: true });
});
