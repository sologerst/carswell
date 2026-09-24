"use client";

import { ArrowUp, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { TasteCheck } from "@/components/onboarding/taste-check";
import { Button } from "@/components/ui/button";
import { Chip, Input } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { OPENING_HINT, type Slot } from "@/lib/onboarding/slots";
import { api, cn } from "@/lib/utils";

interface Turn {
  reply: string;
  zip?: string | null;
  slot: Slot | null;
  progress: number;
  done: boolean;
  aiUsed: boolean;
  summary?: string;
}

interface Bubble {
  role: "assistant" | "user";
  text: string;
}

export function OnboardingChat({ aiEnabled }: { aiEnabled: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [progress, setProgress] = useState(0);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(true);
  const [multi, setMulti] = useState<string[]>([]);
  const [zip, setZip] = useState("");
  const [zipDone, setZipDone] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  const apply = useCallback((t: Turn) => {
    setBubbles((b) => [...b, { role: "assistant", text: t.reply }]);
    setSlot(t.slot);
    setProgress(t.progress);
    setMulti([]);
    if (t.zip) setZipDone(true);
    if (t.done) setSummary(t.summary ?? "");
  }, []);

  const send = useCallback(async (body: { message?: string; chip?: { slot: string; value: string } }, echo?: string) => {
    if (echo) setBubbles((b) => [...b, { role: "user", text: echo }]);
    setBusy(true);
    try {
      apply(await api<Turn>("/api/onboarding/chat", { json: body }));
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }, [apply, toast]);

  // Opening question (no state set synchronously; a stale response is ignored).
  useEffect(() => {
    let alive = true;
    api<Turn>("/api/onboarding/chat", { json: {} })
      .then((t) => alive && apply(t))
      .catch((e: Error) => alive && toast(e.message, "error"))
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
  }, [apply, toast]);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [bubbles, slot, summary]);

  const submitText = (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || busy) return;
    setText("");
    send({ message: t }, t);
  };

  const onTaste = useCallback(async (picks: { chosen: string[]; rejected: string[] }) => {
    setBusy(true);
    try {
      apply(await api<Turn>("/api/onboarding/taste", { json: picks }));
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }, [apply, toast]);

  const freeText = !slot || (slot.id !== "taste" && slot.id !== "location");

  return (
    <div className="mx-auto flex h-dvh max-w-2xl flex-col">
      <header className="pt-safe shrink-0 px-5">
        <div className="flex h-14 items-center justify-between">
          <span className="inline-flex items-center gap-2 font-bold"><Sparkles className="size-4 text-accent-soft" /> Let&apos;s find your car</span>
          <Link href="/onboarding/form" className="tap inline-flex items-center text-sm font-bold text-muted hover:text-ink">Skip to form</Link>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-navy-800" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Onboarding progress">
          <motion.div className="brand-gradient h-full" animate={{ width: `${Math.max(4, progress * 100)}%` }} />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6" aria-live="polite">
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {bubbles.map((b, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className={cn("max-w-[85%] rounded-3xl px-4 py-3 text-[15px] leading-relaxed", b.role === "assistant" ? "rounded-bl-lg bg-navy-800" : "ml-auto rounded-br-lg bg-accent text-white")}>
                {b.text}
              </motion.div>
            ))}
          </AnimatePresence>
          {busy && <div className="w-16 rounded-3xl rounded-bl-lg bg-navy-800 px-4 py-3 text-muted" aria-label="Thinking">•••</div>}
          {!slot && bubbles.length === 1 && !busy && <p className="px-1 text-sm text-subtle">{OPENING_HINT}</p>}

          {summary !== null && (
            <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="rounded-3xl border border-accent/40 bg-navy-850 p-5">
              <p className="text-xs font-bold uppercase tracking-widest text-accent-soft">What I think you want</p>
              <p className="mt-2 text-lg font-bold">{summary}</p>
              <p className="mt-2 text-sm text-muted">You can change any of this on your profile.</p>
              <Button size="lg" className="mt-4 w-full" onClick={() => { router.replace("/deck"); router.refresh(); }}>Start swiping</Button>
            </motion.div>
          )}

          {slot?.id === "taste" && !busy && summary === null && <div className="pt-2"><TasteCheck onDone={onTaste} /></div>}
          <div ref={end} />
        </div>
      </div>

      {summary === null && (
        <div className="pb-safe shrink-0 border-t border-line bg-navy-950 px-5 pt-3">
          {slot && slot.id !== "taste" && slot.chips.length > 0 && (slot.id !== "location" || zipDone) && (
            <div className="mb-3 flex flex-wrap gap-2">
              {slot.chips.map((c) => (
                <Chip key={c.value} disabled={busy} selected={multi.includes(c.value)} className={c.body ? "h-auto flex-col gap-1 rounded-2xl py-2" : ""}
                  onClick={() => {
                    if (slot.multi) setMulti((m) => (m.includes(c.value) ? m.filter((x) => x !== c.value) : [...m, c.value]));
                    else send({ chip: { slot: slot.id, value: c.value } }, c.label);
                  }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {c.body && <img src={`/fx/car/${c.body}/9d8cff/4?label=0`} alt="" className="h-10 w-16 rounded-lg object-cover" />}
                  {c.label}
                </Chip>
              ))}
              {slot.multi && (
                <Button size="sm" disabled={!multi.length || busy} onClick={() => send({ chip: { slot: slot.id, value: multi.join(",") } }, slot.chips.filter((c) => multi.includes(c.value)).map((c) => c.label).join(", "))}>
                  Done
                </Button>
              )}
            </div>
          )}
          {slot?.id === "location" && !zipDone && (
            <form className="mb-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (/^\d{5}$/.test(zip)) { setZipDone(true); send({ chip: { slot: "location", value: zip } }, zip); } }}>
              <Input inputMode="numeric" autoComplete="postal-code" maxLength={5} placeholder="ZIP code" value={zip} onChange={(e) => setZip(e.target.value.replace(/\D/g, ""))} aria-label="ZIP code" />
              <Button type="submit" disabled={zip.length !== 5 || busy}>Next</Button>
            </form>
          )}
          {freeText && (
            <form onSubmit={submitText} className="mb-3 flex items-end gap-2">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) submitText(e); }}
                rows={slot ? 1 : 3}
                placeholder={slot ? "Or type an answer…" : "I've got two kids and a lab, commute on I-40, weekends at Percy Priest…"}
                aria-label="Your answer"
                className="min-h-12 flex-1 resize-none rounded-3xl border border-line bg-navy-850 px-4 py-3 text-base placeholder:text-subtle focus:border-accent focus:outline-none"
              />
              <Button type="submit" size="icon" disabled={!text.trim() || busy} aria-label="Send"><ArrowUp /></Button>
            </form>
          )}
          {!aiEnabled && <p className="mb-2 text-center text-[11px] text-subtle">Quick setup mode: I understand the basics; add an Anthropic key for full AI onboarding.</p>}
        </div>
      )}
    </div>
  );
}
