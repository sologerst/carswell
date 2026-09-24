"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CalendarClock, CloudOff, Heart, Info, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CarDetail, type DetailCard } from "@/components/car/car-detail";
import { CardPreview, SwipeCard, type SwipeCardHandle } from "@/components/deck/swipe-card";
import { TestDrivePicker } from "@/components/deck/test-drive-picker";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import type { ProfilingQuestion } from "@/lib/deck/progressive";
import type { Loosening } from "@/lib/deck/rescue";
import { dequeue, enqueue, flush, pending } from "@/lib/offline/queue";
import { listingTitle, type DeckCard, type SwipeAction } from "@/lib/types";
import { api, cn, uuid } from "@/lib/utils";

export interface DeckPayload {
  cards: DeckCard[];
  remaining: number;
  rescue: { option: Loosening; gain: number }[];
  question: ProfilingQuestion | null;
  swipeCount: number;
}

interface HistoryItem {
  card: DeckCard;
  clientId: string;
  action: SwipeAction;
}

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

const VERB: Record<SwipeAction, string> = { like: "Liked", pass: "Passed", superlike: "Requested a test drive for" };

export function DeckView({ initial, origin, anchorTitle }: {
  initial: DeckPayload;
  origin: { lat: number; lng: number; label: string };
  anchorTitle?: string | null;
}) {
  const toast = useToast();
  const reduced = useReducedMotion() ?? false;
  const [cards, setCards] = useState<DeckCard[]>(initial.cards);
  const [rescue, setRescue] = useState(initial.rescue);
  const [question, setQuestion] = useState<ProfilingQuestion | null>(null);
  const nextQuestion = useRef<ProfilingQuestion | null>(initial.question);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<DeckCard | null>(null);
  const [driveCard, setDriveCard] = useState<DeckCard | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const [announce, setAnnounce] = useState("");
  const [busy, setBusy] = useState(false);
  const topRef = useRef<SwipeCardHandle>(null);
  const events = useRef<{ listing_id: string; kind: string }[]>([]);
  const swipedIds = useRef<string[]>([]);

  const top = cards[0] ?? null;

  const refreshPending = useCallback(async () => setPendingCount((await pending()).length), []);

  const doFlush = useCallback(async () => {
    const results = await flush();
    for (const r of results) {
      if (r.status === "limit") toast("You've hit today's like limit. Likes reset at midnight.", "error");
      if (r.status === "downgraded") toast("3 test-drive requests a day max; sent as a like.");
    }
    await refreshPending();
  }, [toast, refreshPending]);

  const fetchMore = useCallback(async (opts: { anchor?: string; replace?: boolean } = {}) => {
    setLoading(true);
    try {
      const held = opts.replace ? [] : cards.map((c) => c.listing.id);
      const queued = (await pending()).map((s) => s.listing_id).filter((x): x is string => Boolean(x));
      const data = await api<DeckPayload>("/api/deck", { json: { exclude: [...new Set([...held, ...queued, ...swipedIds.current.slice(-200)])], anchor: opts.anchor ?? null } });
      setCards((prev) => {
        const base = opts.replace ? prev.slice(0, 1) : prev;
        const have = new Set(base.map((c) => c.listing.id));
        return [...base, ...data.cards.filter((c) => !have.has(c.listing.id))];
      });
      setRescue(data.rescue);
      if (data.question) nextQuestion.current = data.question;
    } catch (e) {
      if (navigator.onLine) toast((e as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }, [cards, toast]);

  // Online/offline + queued swipe sync.
  useEffect(() => {
    const first = setTimeout(doFlush, 0);
    const on = () => doFlush();
    const onMsg = (e: MessageEvent) => { if (e.data?.type === "flush-swipes") doFlush(); };
    window.addEventListener("online", on);
    navigator.serviceWorker?.addEventListener("message", onMsg);
    const t = setInterval(doFlush, 15_000);
    return () => {
      window.removeEventListener("online", on);
      navigator.serviceWorker?.removeEventListener("message", onMsg);
      clearTimeout(first);
      clearInterval(t);
    };
  }, [doFlush]);

  // Impressions, batched.
  useEffect(() => {
    if (top) events.current.push({ listing_id: top.listing.id, kind: "impression" });
    // Preload the next 3 cards' photos.
    for (const c of cards.slice(1, 4)) for (const src of c.listing.photos.slice(0, 2)) { const img = new Image(); img.src = src; }
  }, [top, cards]);
  useEffect(() => {
    const t = setInterval(() => {
      if (!events.current.length || !navigator.onLine) return;
      const batch = events.current.splice(0, 100);
      fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ events: batch }) }).catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, []);

  const commit = useCallback(async (action: SwipeAction, card: DeckCard, windows?: { day: string; time: string }[]) => {
    if (busy) return;
    setBusy(true);
    try {
      await topRef.current?.fling(action);
      const clientId = uuid();
      setCards((c) => c.filter((x) => x.listing.id !== card.listing.id));
      setHistory((h) => [...h.slice(-19), { card, clientId, action }]);
      swipedIds.current.push(card.listing.id);
      await enqueue({
        client_id: clientId, listing_id: card.listing.id, action, swiped_at: new Date().toISOString(),
        exploration: card.exploration, score: Number(card.score.toFixed(4)), test_drive_windows: windows,
      });
      if ("vibrate" in navigator && action !== "pass") navigator.vibrate?.(12);
      const next = cards.find((c) => c.listing.id !== card.listing.id);
      setAnnounce(`${VERB[action]} ${listingTitle(card.listing)}.${next ? ` Next: ${listingTitle(next.listing)}, ${Math.round(next.listing.price).toLocaleString("en-US")} dollars.` : ""}`);
      if (action === "superlike") toast(`Test-drive request sent for the ${listingTitle(card.listing)}`, "success");
      doFlush();
      if (cards.length - 1 < 6) fetchMore();
      if (nextQuestion.current && !question) {
        setQuestion(nextQuestion.current);
        nextQuestion.current = null;
      }
    } finally {
      setBusy(false);
    }
  }, [busy, cards, doFlush, fetchMore, question, toast]);

  const onSwipe = useCallback((action: SwipeAction) => {
    if (!top) return;
    if (action === "superlike") {
      setDriveCard(top);
      return;
    }
    commit(action, top);
  }, [top, commit]);

  const undo = useCallback(async () => {
    const last = history[history.length - 1];
    if (!last || busy) return;
    setHistory((h) => h.slice(0, -1));
    const wasQueued = await dequeue(last.clientId);
    if (!wasQueued) {
      await enqueue({ client_id: uuid(), action: "undo", undo_of: last.clientId, swiped_at: new Date().toISOString() });
      doFlush();
    }
    await refreshPending();
    swipedIds.current = swipedIds.current.filter((id) => id !== last.card.listing.id);
    setCards((c) => [last.card, ...c.filter((x) => x.listing.id !== last.card.listing.id)]);
    setAnnounce(`Undid ${VERB[last.action].toLowerCase()} ${listingTitle(last.card.listing)}.`);
  }, [history, busy, doFlush, refreshPending]);

  // Keyboard: ← pass, → like, ↑ test drive, Z undo, Enter details.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [role=dialog]") || detail || driveCard || question) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); onSwipe("pass"); }
      else if (e.key === "ArrowRight") { e.preventDefault(); onSwipe("like"); }
      else if (e.key === "ArrowUp") { e.preventDefault(); onSwipe("superlike"); }
      else if (e.key.toLowerCase() === "z" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); undo(); }
      else if (e.key === "Enter" && top) { e.preventDefault(); setDetail(top); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSwipe, undo, top, detail, driveCard, question]);

  async function applyRescue(option: Loosening) {
    try {
      await api("/api/prefs", {
        method: "PATCH",
        json: {
          set: Object.fromEntries(option.prefPatches.filter((p) => p.pref).map((p) => [p.key, p.pref])),
          delete: option.prefPatches.filter((p) => !p.pref).map((p) => p.key),
          profile: option.radiusMi ? { radius_mi: option.radiusMi } : undefined,
        },
      });
      toast(`${option.label}. Loading more cars…`);
      await fetchMore();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  async function answer(optionIndex: number) {
    const q = question;
    setQuestion(null);
    if (!q) return;
    try {
      await api("/api/prefs/question", { json: { questionId: q.id, option: optionIndex } });
      if (optionIndex >= 0 && q.options[optionIndex]?.set) toast("Got it. I'll tune your deck.");
    } catch {}
  }

  async function moreLikeThis(card: DeckCard) {
    setDetail(null);
    events.current.push({ listing_id: card.listing.id, kind: "more_like_this" });
    toast(`Finding more like the ${listingTitle(card.listing)}…`);
    await fetchMore({ anchor: card.listing.id, replace: true });
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-68px-var(--safe-bottom))] max-w-6xl flex-col px-3 pt-safe lg:h-dvh lg:flex-row lg:gap-8 lg:px-8 lg:py-6">
      <p className="sr-only" aria-live="polite">{announce}</p>

      <section className="relative mx-auto flex w-full max-w-[460px] min-h-0 flex-1 flex-col lg:max-w-[440px]" aria-label="Car deck">
        <header className="flex h-14 shrink-0 items-center justify-between px-1">
          <span className="text-lg font-bold tracking-tight lg:hidden">{process.env.NEXT_PUBLIC_APP_NAME ?? "CarSwipe"}</span>
          <span className="hidden text-sm text-muted lg:inline">{anchorTitle ? `More like the ${anchorTitle}` : "Your deck"}</span>
          <div className="flex items-center gap-2">
            {(!online || pendingCount > 0) && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-navy-800 px-3 py-1.5 text-xs font-bold text-muted">
                <CloudOff className="size-3.5" /> {online ? `Syncing ${pendingCount}` : `Offline · ${pendingCount} saved`}
              </span>
            )}
            <Link href="/profile" aria-label="Tune your preferences" className="tap grid place-items-center rounded-full text-muted hover:bg-navy-800 hover:text-ink">
              <SlidersHorizontal className="size-5" />
            </Link>
          </div>
        </header>

        <div className="relative min-h-0 flex-1">
          {cards.slice(1, 3).reverse().map((c, i, arr) => <CardPreview key={c.listing.id} card={c} depth={arr.length - i} />)}
          <AnimatePresence initial={false}>
            {top && (
              <motion.div key={top.listing.id} className="absolute inset-0" initial={{ scale: 0.96, opacity: 0.6 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0.01 : 0.2 }}>
                <SwipeCard ref={topRef} card={top} onSwipe={onSwipe} onOpen={() => setDetail(top)} reducedMotion={reduced} onPhotoCycle={() => events.current.push({ listing_id: top.listing.id, kind: "photo_cycle" })} />
              </motion.div>
            )}
          </AnimatePresence>
          {!top && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-[var(--radius-card)] border border-dashed border-line px-6 text-center">
              {loading ? <p className="text-muted">Finding cars…</p> : (
                <>
                  <p className="text-xl font-bold">You&apos;ve seen every match for now</p>
                  <p className="text-muted">{rescue.length ? "One tap opens up more cars:" : "Check back soon: new Nashville listings arrive daily."}</p>
                  <div className="flex w-full max-w-xs flex-col gap-2">
                    {rescue.map(({ option, gain }) => (
                      <Button key={option.id} variant="secondary" onClick={() => applyRescue(option)}>{option.label}: +{gain} cars</Button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          <AnimatePresence>
            {question && (
              <motion.div role="dialog" aria-label="Quick question" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
                className="absolute inset-x-3 bottom-3 z-10 rounded-3xl border border-accent/40 bg-navy-800/95 p-4 shadow-2xl backdrop-blur">
                <p className="font-bold">{question.text}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {question.options.map((o, i) => <Button key={o.label} size="sm" variant={i === 0 ? "primary" : "secondary"} onClick={() => answer(i)}>{o.label}</Button>)}
                  <Button size="sm" variant="ghost" onClick={() => answer(-1)}>Not now</Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Few cards left: offer the rescue options early. */}
        {top && cards.length < 4 && rescue.length > 0 && !loading && (
          <div className="mt-2 flex gap-2 overflow-x-auto scrollbar-none">
            {rescue.map(({ option, gain }) => (
              <button key={option.id} onClick={() => applyRescue(option)} className="shrink-0 rounded-full bg-navy-800 px-3 py-1.5 text-xs font-bold text-muted hover:text-ink cursor-pointer">{option.label}: +{gain}</button>
            ))}
          </div>
        )}

        <div className="flex shrink-0 items-center justify-center gap-3 py-3 lg:py-5" role="group" aria-label="Swipe actions">
          <RoundButton label="Undo (Z)" onClick={undo} disabled={!history.length} small><RotateCcw /></RoundButton>
          <RoundButton label="Pass (Left arrow)" onClick={() => onSwipe("pass")} disabled={!top}><X className="!size-8" /></RoundButton>
          <RoundButton label="Test drive (Up arrow)" onClick={() => onSwipe("superlike")} disabled={!top} className="text-drive"><CalendarClock className="!size-6" /></RoundButton>
          <RoundButton label="Like (Right arrow)" onClick={() => onSwipe("like")} disabled={!top} className="bg-accent text-white hover:bg-accent-strong"><Heart className="!size-8 fill-current" /></RoundButton>
          <RoundButton label="Details (Enter)" onClick={() => top && setDetail(top)} disabled={!top} small><Info /></RoundButton>
        </div>
      </section>

      {/* Desktop: the top card's brief and details sit beside the deck. */}
      <aside className="hidden min-h-0 flex-1 overflow-y-auto rounded-[var(--radius-card)] border border-line bg-navy-900/60 p-6 lg:block" aria-label="Car details">
        {top ? <CarDetail key={top.listing.id} card={top as DetailCard} origin={origin} onMoreLikeThis={() => moreLikeThis(top)} /> : <p className="text-muted">No car selected.</p>}
      </aside>

      <Sheet open={Boolean(detail)} onOpenChange={(o) => !o && setDetail(null)} title="Car details">
        {detail && (
          <CarDetail
            card={detail as DetailCard}
            origin={origin}
            onLike={() => { setDetail(null); commit("like", detail); }}
            onTestDrive={() => { setDetail(null); setDriveCard(detail); }}
            onMoreLikeThis={() => moreLikeThis(detail)}
          />
        )}
      </Sheet>

      <TestDrivePicker
        open={Boolean(driveCard)}
        title={driveCard ? listingTitle(driveCard.listing) : ""}
        onOpenChange={(o) => { if (!o) { setDriveCard(null); topRef.current?.reset(); } }}
        onConfirm={(windows) => { const c = driveCard; setDriveCard(null); if (c) commit("superlike", c, windows); }}
      />
    </div>
  );
}

function RoundButton({ children, label, onClick, disabled, small, className }: {
  children: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; small?: boolean; className?: string;
}) {
  return (
    <button
      type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled}
      className={cn(
        "grid place-items-center rounded-full border border-line bg-navy-850 text-ink shadow-lg transition-transform active:scale-90 disabled:opacity-40 cursor-pointer hover:bg-navy-800",
        small ? "size-12 [&_svg]:size-5 text-muted" : "size-16 [&_svg]:size-7",
        className,
      )}
    >
      {children}
    </button>
  );
}
