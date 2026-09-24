import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChatView } from "@/components/chat/chat-view";
import { loadConversation } from "@/lib/server/chat";
import { requireProfile } from "@/lib/server/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Chat" };

export default async function SellerChatPage({ params }: PageProps<"/sell/chat/[id]">) {
  const { id } = await params;
  const profile = await requireProfile(`/sell/chat/${id}`);
  const supabase = await createClient();
  const conv = await loadConversation(supabase, id);
  if (!conv || conv.sellerUserId !== profile.id) notFound();
  return (
    <div className="-mx-4 -my-6">
      <ChatView
        conversationId={conv.id}
        interestId={conv.interestId}
        role="seller"
        title={conv.title}
        counterpart={conv.buyerName}
        photo={conv.photo}
        initial={conv.messages}
        backHref={`/sell/leads/${conv.interestId}`}
        phoneShared={conv.phoneShared}
        dealershipId={null}
        sellerUserId={conv.sellerUserId}
        heightClass="h-[calc(100dvh-64px-var(--safe-top))]"
      />
    </div>
  );
}
