import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChatView } from "@/components/chat/chat-view";
import { loadConversation } from "@/lib/server/chat";
import { requireOnboarded } from "@/lib/server/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Chat" };

export default async function BuyerChatPage({ params }: PageProps<"/chat/[id]">) {
  const { id } = await params;
  const profile = await requireOnboarded(`/chat/${id}`);
  const supabase = await createClient();
  const conv = await loadConversation(supabase, id);
  if (!conv || conv.buyerId !== profile.id) notFound();
  return (
    <ChatView
      conversationId={conv.id}
      interestId={conv.interestId}
      role="buyer"
      title={conv.title}
      counterpart={conv.dealerName}
      photo={conv.photo}
      initial={conv.messages}
      backHref="/offers"
      phoneShared={conv.phoneShared}
      dealershipId={conv.dealershipId}
    />
  );
}
