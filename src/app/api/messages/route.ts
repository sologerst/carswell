import { z } from "zod";
import { scoreMessage } from "@/lib/safety/scam";
import { ApiError, apiProfile, json, readJson, route } from "@/lib/server/api";
import { createAdminClient } from "@/lib/supabase/admin";

const Body = z.object({
  conversationId: z.string().uuid(),
  body: z.string().trim().min(1).max(4000),
  kind: z.enum(["text", "test_drive_proposal"]).default("text"),
  meta: z.record(z.string(), z.unknown()).refine((m) => JSON.stringify(m).length <= 2000, "meta too large").optional(),
  draftId: z.string().uuid().optional(),
});

/**
 * Send a chat message. Messages are scored for scam patterns and inserted by
 * the server (users have no direct insert policy), so scoring can't be skipped.
 */
export const POST = route(async (req: Request) => {
  const { supabase, profile } = await apiProfile();
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new ApiError(400, "Invalid message.");
  const { conversationId, body, kind, meta, draftId } = parsed.data;

  // RLS: this select only succeeds for the buyer, the private seller or the dealer's members.
  const { data: conv } = await supabase.from("conversations").select("id, buyer_id, dealership_id, seller_user_id").eq("id", conversationId).maybeSingle();
  if (!conv) throw new ApiError(404, "Conversation not found.");
  const role = conv.buyer_id === profile.id ? "buyer" : conv.seller_user_id === profile.id ? "seller" : "dealer";

  const scam = scoreMessage(body, { matched: true });
  const admin = createAdminClient();
  const { data: msg, error } = await admin.from("messages").insert({
    conversation_id: conversationId,
    sender_id: profile.id,
    sender_role: role,
    kind,
    body,
    meta: (meta ?? {}) as never,
    scam_score: scam.score,
    flagged: scam.flagged,
  }).select("*").single();
  if (error) throw new ApiError(error.message.includes("rate limit") ? 429 : 400, error.message);

  if (draftId) await supabase.from("message_drafts").update({ status: "sent" }).eq("id", draftId).eq("user_id", profile.id);

  // Notify the other side.
  if (role === "buyer" && conv.seller_user_id) {
    await admin.from("notifications").insert({
      user_id: conv.seller_user_id, kind: "message", title: `${profile.first_name ?? "The buyer"} sent a message`, body: body.slice(0, 140), url: `/sell/chat/${conversationId}`,
    });
  } else if (role === "buyer" && conv.dealership_id) {
    const { data: members } = await admin.from("dealership_members").select("user_id").eq("dealership_id", conv.dealership_id);
    if (members?.length) {
      await admin.from("notifications").insert(members.map((m) => ({
        user_id: m.user_id, kind: "message", title: `${profile.first_name ?? "Your buyer"} sent a message`, body: body.slice(0, 140), url: `/dealer/chat/${conversationId}`,
      })));
    }
  } else {
    await admin.from("notifications").insert({
      user_id: conv.buyer_id, kind: "message", title: role === "seller" ? "New message from the seller" : "New message from the dealer", body: body.slice(0, 140), url: `/chat/${conversationId}`,
    });
  }
  return json({ message: msg, warning: scam.flagged ? scam.reasons : null });
});
