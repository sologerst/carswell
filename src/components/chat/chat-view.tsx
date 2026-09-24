"use client";

import { AlertTriangle, ArrowLeft, ArrowUp, CalendarClock, FileText, Flag, KeyRound, Phone, ShieldCheck, UserX } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DraftTray } from "@/components/agent/draft-tray";
import { TestDrivePicker } from "@/components/deck/test-drive-picker";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { api, cn } from "@/lib/utils";

export interface ChatMessage {
  id: string;
  sender_id: string | null;
  sender_role: "buyer" | "dealer" | "seller" | "system";
  kind: "text" | "test_drive_proposal" | "phone_share" | "system" | "document" | "safety";
  body: string;
  meta: Record<string, unknown>;
  flagged: boolean;
  created_at: string;
}

export function ChatView({
  conversationId, interestId, role, title, counterpart, photo, initial, backHref, phoneShared, dealershipId, sellerUserId = null,
  heightClass = "h-[calc(100dvh-68px-var(--safe-bottom))] lg:h-dvh",
}: {
  heightClass?: string;
  conversationId: string;
  interestId: string;
  role: "buyer" | "dealer" | "seller";
  title: string;
  counterpart: string;
  photo: string | null;
  initial: ChatMessage[];
  backHref: string;
  phoneShared: boolean;
  dealershipId: string | null;
  /** Set for private sales. */
  sellerUserId?: string | null;
}) {
  const privateSale = Boolean(sellerUserId);
  const toast = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>(initial);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [picker, setPicker] = useState(false);
  const [menu, setMenu] = useState(false);
  const [shared, setShared] = useState(phoneShared);
  const end = useRef<HTMLDivElement>(null);

  // Live chat over Supabase Realtime Broadcast (private channel per conversation).
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      await supabase.realtime.setAuth();
      channel = supabase
        .channel(`conversation:${conversationId}`, { config: { private: true } })
        .on("broadcast", { event: "INSERT" }, ({ payload }) => {
          const record = (payload as { record?: ChatMessage }).record;
          if (record) setMessages((m) => (m.some((x) => x.id === record.id) ? m : [...m, record]));
        })
        .subscribe();
    })();
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [conversationId]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  async function send(body: string, kind: "text" | "test_drive_proposal" = "text", meta?: Record<string, unknown>) {
    setSending(true);
    try {
      const { message, warning } = await api<{ message: ChatMessage; warning: string[] | null }>("/api/messages", { json: { conversationId, body, kind, meta } });
      setMessages((m) => (m.some((x) => x.id === message.id) ? m : [...m, message]));
      if (warning) toast("Heads up: that message matches a common scam pattern.", "error");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSending(false);
    }
  }

  async function sharePhone() {
    const { error } = await createClient().rpc("share_phone", { p_conversation_id: conversationId });
    if (error) toast(error.message, "error");
    else { setShared(true); toast(`Shared your phone with ${counterpart}.`); }
    setMenu(false);
  }

  async function report(target: "message" | "dealership" | "user", id: string) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("reports").insert({ reporter_id: user!.id, target_type: target, target_id: id, reason: target === "message" ? "suspicious_message" : target === "user" ? "seller_conduct" : "dealer_conduct" });
    toast(error ? error.message : "Reported. Our team will review it.");
    setMenu(false);
  }

  async function block() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("blocks").insert(
      sellerUserId ? { user_id: user!.id, blocked_user_id: sellerUserId } : { user_id: user!.id, blocked_dealership_id: dealershipId },
    );
    toast(error ? error.message : `Blocked ${counterpart}. You won't see their cars.`);
    setMenu(false);
  }

  return (
    <div className={cn("mx-auto flex max-w-3xl flex-col", heightClass)}>
      <header className="pt-safe flex shrink-0 items-center gap-3 border-b border-line px-3 py-2">
        <Link href={backHref} aria-label="Back" className="tap grid place-items-center rounded-full text-muted hover:text-ink"><ArrowLeft className="size-5" /></Link>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {photo && <img src={photo} alt="" className="size-10 rounded-xl object-cover" />}
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{counterpart}</p>
          <p className="truncate text-xs text-muted">{title}</p>
        </div>
        {role === "buyer" && (
          <Button size="sm" variant="secondary" asChild><Link href={`/journey/${interestId}`}><KeyRound /> Next steps</Link></Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setMenu(true)} aria-label="Chat options">•••</Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <p className="mx-auto mb-4 flex max-w-md items-start gap-2 rounded-2xl bg-navy-850 px-3 py-2 text-xs text-muted">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-deal-good" />
          {privateSale
            ? "Private sale: meet in a public place, check the title matches the seller's ID, and never pay by gift card, wire or crypto."
            : "Meet at the dealership for test drives. Never wire money, pay with gift cards, or share a verification code."}
        </p>
        <ul className="space-y-2" aria-live="polite">
          {messages.map((m) => {
            const mine = m.sender_role === role;
            if (m.kind === "safety") {
              return (
                <li key={m.id} className="mx-auto max-w-md rounded-2xl border border-deal-good/30 bg-deal-good/10 px-4 py-3 text-sm">
                  <p className="mb-1 flex items-center gap-1.5 font-bold text-deal-good"><ShieldCheck className="size-4" /> Safety tips</p>
                  <p className="text-muted">{m.body}</p>
                </li>
              );
            }
            if (m.sender_role === "system" || m.kind === "system") {
              return <li key={m.id} className="py-2 text-center text-xs font-bold text-subtle">{m.body}</li>;
            }
            const docUrl = m.kind === "document" && typeof m.meta?.url === "string" ? m.meta.url : null;
            const windows = (m.meta?.windows as { day: string; time: string }[] | undefined) ?? [];
            return (
              <li key={m.id} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
                <div className={cn("max-w-[80%] rounded-3xl px-4 py-2.5 text-[15px] leading-relaxed", mine ? "rounded-br-lg bg-accent text-white" : "rounded-bl-lg bg-navy-800")}>
                  {m.kind === "test_drive_proposal" && <p className="mb-1 flex items-center gap-1 text-xs font-bold opacity-80"><CalendarClock className="size-3.5" /> Test-drive proposal</p>}
                  {m.kind === "phone_share" && <p className="mb-1 flex items-center gap-1 text-xs font-bold opacity-80"><Phone className="size-3.5" /> Phone shared</p>}
                  {m.kind === "document" && <p className="mb-1 flex items-center gap-1 text-xs font-bold opacity-80"><FileText className="size-3.5" /> Document</p>}
                  <p className="whitespace-pre-wrap">{m.body}</p>
                  {docUrl && <a href={docUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-sm font-bold underline">Open (link expires in 7 days)</a>}
                  {m.kind === "test_drive_proposal" && !mine && windows.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {windows.map((w) => (
                        <button key={w.day + w.time} className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold hover:bg-white/25 cursor-pointer" onClick={() => send(`Confirmed: ${w.day}, ${w.time}. See you then!`, "text", { confirmed_window: w })}>
                          {w.day} {w.time}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {m.flagged && !mine && (
                  <p className="mt-1 flex max-w-[80%] items-center gap-1 text-xs font-bold text-deal-bad">
                    <AlertTriangle className="size-3.5" /> This looks like a known scam pattern. Don&apos;t send money or codes.
                    <button className="underline cursor-pointer" onClick={() => report("message", m.id)}>Report</button>
                  </p>
                )}
                <span className="mt-0.5 px-2 text-[10px] text-subtle">{new Date(m.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
              </li>
            );
          })}
        </ul>
        <div ref={end} />
      </div>

      <div className="pb-safe shrink-0 space-y-3 border-t border-line bg-navy-950 px-3 pt-3">
        {role === "buyer" && <DraftTray interestId={interestId} conversationId={conversationId} intents={["negotiate", "test_drive", "question"]} />}
        <form className="mb-3 flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); const t = text.trim(); if (t) { setText(""); send(t); } }}>
          <button type="button" aria-label="Propose test-drive times" onClick={() => setPicker(true)} className="tap grid shrink-0 place-items-center rounded-full bg-navy-800 text-drive cursor-pointer"><CalendarClock className="size-5" /></button>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} placeholder="Message" aria-label="Message"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); const t = text.trim(); if (t) { setText(""); send(t); } } }}
            className="min-h-11 flex-1 resize-none rounded-3xl border border-line bg-navy-850 px-4 py-2.5 text-base placeholder:text-subtle focus:border-accent focus:outline-none" />
          <Button type="submit" size="icon" disabled={!text.trim() || sending} aria-label="Send"><ArrowUp /></Button>
        </form>
      </div>

      <TestDrivePicker open={picker} onOpenChange={setPicker} title={title}
        onConfirm={(windows) => { setPicker(false); send(`Could we do ${windows.map((w) => `${w.day} ${w.time}`).join(" or ")}?`, "test_drive_proposal", { windows }); }} />

      <Sheet open={menu} onOpenChange={setMenu} title="Chat options" side="bottom">
        <div className="grid gap-2">
          {role === "buyer" && (
            <Button variant="secondary" onClick={sharePhone} disabled={shared}><Phone /> {shared ? "Phone number shared" : `Share my phone number with ${counterpart}`}</Button>
          )}
          <Button variant="secondary" onClick={() => (privateSale && role === "buyer" ? report("user", sellerUserId!) : dealershipId ? report("dealership", dealershipId) : report("message", conversationId))}>
            <Flag /> Report {role === "buyer" ? (privateSale ? "this seller" : "this dealer") : "this conversation"}
          </Button>
          {role === "buyer" && <Button variant="danger" onClick={block}><UserX /> Block {counterpart}</Button>}
        </div>
      </Sheet>
    </div>
  );
}
