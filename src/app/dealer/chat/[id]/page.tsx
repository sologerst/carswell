import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChatView } from "@/components/chat/chat-view";
import { loadConversation } from "@/lib/server/chat";
import { requireDealer } from "@/lib/server/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Chat" };

export default async function DealerChatPage({ params }: PageProps<"/dealer/chat/[id]">) {
  const { id } = await params;
  const { membership } = await requireDealer();
  const supabase = await createClient();
  const conv = await loadConversation(supabase, id);
  if (!conv || conv.dealershipId !== membership.dealership_id) notFound();
  return (
    <div className="-mx-4 -my-6 lg:-mx-8">
      <ChatView
        conversationId={conv.id}
        interestId={conv.interestId}
        role="dealer"
        title={conv.title}
        counterpart={conv.buyerName}
        photo={conv.photo}
        initial={conv.messages}
        backHref={`/dealer/leads/${conv.interestId}`}
        phoneShared={conv.phoneShared}
        dealershipId={conv.dealershipId}
        heightClass="h-[calc(100dvh-64px-var(--safe-top))]"
      />
    </div>
  );
}
