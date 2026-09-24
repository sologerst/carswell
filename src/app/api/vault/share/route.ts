import { z } from "zod";
import { ApiError, apiProfile, json, readJson, route } from "@/lib/server/api";
import { createAdminClient } from "@/lib/supabase/admin";

const Body = z.object({ documentId: z.string().uuid(), conversationId: z.string().uuid() });

const KIND_LABEL: Record<string, string> = {
  license: "Driver's license", insurance: "Insurance card", income: "Proof of income", trade_title: "Trade-in title",
  payoff: "Payoff letter", preapproval: "Loan pre-approval", other: "Document",
};

/** Share a vault document into a matched chat as a 7-day link (buyer only). */
export const POST = route(async (req: Request) => {
  const { supabase, profile } = await apiProfile();
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new ApiError(400, "Invalid request.");
  const [{ data: doc }, { data: conv }] = await Promise.all([
    supabase.from("vault_documents").select("*").eq("id", parsed.data.documentId).maybeSingle(),
    supabase.from("conversations").select("id, buyer_id").eq("id", parsed.data.conversationId).maybeSingle(),
  ]);
  if (!doc || doc.user_id !== profile.id) throw new ApiError(404, "Document not found.");
  if (!conv || conv.buyer_id !== profile.id) throw new ApiError(404, "Chat not found.");
  const admin = createAdminClient();
  const { data: signed, error } = await admin.storage.from("vault").createSignedUrl(doc.storage_path, 7 * 86_400);
  if (error || !signed) throw new ApiError(500, "Couldn't create a share link.");
  const { data: msg, error: msgErr } = await admin.from("messages").insert({
    conversation_id: conv.id, sender_id: profile.id, sender_role: "buyer", kind: "document",
    body: `Shared: ${KIND_LABEL[doc.kind] ?? "Document"} (${doc.file_name})`,
    meta: { url: signed.signedUrl, document_id: doc.id, expires_days: 7 } as never,
  }).select("id").single();
  if (msgErr) throw new ApiError(400, msgErr.message);
  return json({ ok: true, messageId: msg.id });
});
