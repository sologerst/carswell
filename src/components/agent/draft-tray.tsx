"use client";

import { Bot, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { api } from "@/lib/utils";

type Intent = "request_otd" | "negotiate" | "test_drive" | "trade_in" | "question";
const LABEL: Record<Intent, string> = {
  request_otd: "Ask for out-the-door price",
  negotiate: "Ask agent to negotiate",
  test_drive: "Set up a test drive",
  trade_in: "Ask about my trade-in",
  question: "Ask a question",
};

interface Draft { id: string; body: string; intent: string; source: "ai" | "template" }

/**
 * The negotiator agent drafts; the buyer approves, edits or discards.
 * Before a match the approved text goes to the dealer as a buyer note; after
 * a match it's sent in the chat.
 */
export function DraftTray({ interestId, conversationId, intents, onSent }: {
  interestId: string;
  conversationId?: string | null;
  intents: Intent[];
  onSent?: () => void;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function make(intent: Intent) {
    setBusy(intent);
    try {
      const { draft } = await api<{ draft: Draft }>("/api/agent/draft", { json: { interestId, intent } });
      setDraft(draft);
      setBody(draft.body);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  async function approve() {
    if (!draft) return;
    setBusy("send");
    try {
      if (conversationId) {
        await api("/api/messages", { json: { conversationId, body, draftId: draft.id } });
      } else {
        const supabase = createClient();
        const { error } = await supabase.rpc("add_buyer_note", { p_interest_id: interestId, p_body: body });
        if (error) throw new Error(error.message);
        await supabase.from("message_drafts").update({ status: "sent", body }).eq("id", draft.id);
      }
      toast("Sent to the dealer.", "success");
      setDraft(null);
      onSent?.();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  async function discard() {
    if (!draft) return;
    await createClient().from("message_drafts").update({ status: "discarded" }).eq("id", draft.id);
    setDraft(null);
  }

  if (draft) {
    return (
      <div className="rounded-3xl border border-accent/40 bg-navy-850 p-4">
        <p className="mb-2 flex items-center gap-2 text-sm font-bold text-accent-soft">
          <Bot className="size-4" /> Agent draft {draft.source === "ai" ? "(AI-written)" : "(template)"} · nothing is sent until you approve
        </p>
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} aria-label="Edit the draft" />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={approve} disabled={!body.trim() || busy === "send"}><Send /> Approve &amp; send</Button>
          <Button size="sm" variant="ghost" onClick={discard}><Trash2 /> Discard</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {intents.map((i) => (
        <Button key={i} size="sm" variant="secondary" onClick={() => make(i)} disabled={Boolean(busy)}>
          <Bot /> {busy === i ? "Drafting…" : LABEL[i]}
        </Button>
      ))}
    </div>
  );
}
