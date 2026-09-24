"use client";

import { motion, useMotionValue, useTransform, animate, type MotionValue, type PanInfo } from "motion/react";
import { forwardRef, useImperativeHandle } from "react";
import { CarPhoto } from "@/components/car/car-photo";
import { DealBadge, Pill } from "@/components/ui/primitives";
import { distance, miles, usd } from "@/lib/format";
import { DRIVE_LABEL, listingTitle, type DeckCard, type SwipeAction } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface SwipeCardHandle {
  fling(action: SwipeAction): Promise<void>;
  reset(): void;
}

const THRESHOLD = 110;

/** The draggable top card. Cards tilt with the drag; stamps fade in with distance. */
export const SwipeCard = forwardRef<SwipeCardHandle, {
  card: DeckCard;
  onSwipe: (action: SwipeAction) => void;
  onOpen: () => void;
  reducedMotion: boolean;
  onPhotoCycle?: () => void;
}>(function SwipeCard({ card, onSwipe, onOpen, reducedMotion, onPhotoCycle }, ref) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const opacity = useMotionValue(1);
  const rotate = useTransform(x, [-300, 0, 300], reducedMotion ? [0, 0, 0] : [-14, 0, 14]);
  const likeOpacity = useTransform(x, [20, THRESHOLD], [0, 1]);
  const passOpacity = useTransform(x, [-THRESHOLD, -20], [1, 0]);
  const driveOpacity = useTransform(y, [-THRESHOLD, -20], [1, 0]);

  async function fling(action: SwipeAction) {
    if (reducedMotion) {
      await animate(opacity, 0, { duration: 0.15 });
      return;
    }
    const w = typeof window !== "undefined" ? window.innerWidth : 800;
    if (action === "like") await animate(x, w + 200, { duration: 0.28, ease: "easeOut" });
    else if (action === "pass") await animate(x, -w - 200, { duration: 0.28, ease: "easeOut" });
    else await animate(y, -900, { duration: 0.3, ease: "easeOut" });
  }
  function reset() {
    animate(x, 0, { type: "spring", stiffness: 500, damping: 35 });
    animate(y, 0, { type: "spring", stiffness: 500, damping: 35 });
  }
  useImperativeHandle(ref, () => ({ fling, reset }));

  function onDragEnd(_: unknown, info: PanInfo) {
    const { offset, velocity } = info;
    if (offset.y < -THRESHOLD && Math.abs(offset.x) < THRESHOLD * 1.2) return onSwipe("superlike");
    if (offset.x > THRESHOLD || velocity.x > 800) return onSwipe("like");
    if (offset.x < -THRESHOLD || velocity.x < -800) return onSwipe("pass");
    animate(x, 0, { type: "spring", stiffness: 500, damping: 35 });
    animate(y, 0, { type: "spring", stiffness: 500, damping: 35 });
  }

  const l = card.listing;
  return (
    <motion.article
      className="absolute inset-0 flex touch-none select-none flex-col overflow-hidden rounded-[var(--radius-card)] border border-white/5 bg-navy-900 shadow-[var(--shadow-card)] will-change-transform"
      style={{ x, y, rotate, opacity }}
      drag={!reducedMotion}
      dragElastic={0.9}
      dragMomentum={false}
      onDragEnd={onDragEnd}
      aria-label={`${listingTitle(l, true)}, ${usd(l.price)}`}
    >
      <div className="relative min-h-0 flex-1">
        <CarPhoto photos={l.photos} alt={listingTitle(l, true)} className="size-full" onCycle={onPhotoCycle} priority />
        <Stamp className="left-5 rotate-[-12deg] border-accent text-accent" style={{ opacity: likeOpacity }}>LIKE</Stamp>
        <Stamp className="right-5 rotate-[12deg] border-white text-white" style={{ opacity: passOpacity }}>PASS</Stamp>
        <Stamp className="left-1/2 top-1/3 -translate-x-1/2 border-drive text-drive" style={{ opacity: driveOpacity }}>TEST DRIVE</Stamp>
        {card.exploration && <span className="absolute bottom-3 left-3 rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-bold backdrop-blur">Something different</span>}
        {l.is_promoted && <span className="absolute right-3 bottom-3 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-bold backdrop-blur">Promoted</span>}
      </div>

      <button type="button" onClick={onOpen} className="block w-full cursor-pointer px-5 pt-4 pb-5 text-left">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[2rem] font-bold leading-none tracking-tight">{usd(l.price)}</p>
            <p className="mt-1 text-sm text-muted">Est. {usd(card.monthlyEstimate)}/mo · {usd(card.otdEstimate)} out the door{card.afterTrade ? " after trade" : ""}</p>
          </div>
          <DealBadge rating={l.deal_rating} />
        </div>
        <h2 className="mt-3 truncate text-lg font-bold">{listingTitle(l, true)}</h2>
        <p className="mt-0.5 text-sm text-muted">
          {[miles(l.miles), distance(l.distance_mi), l.drivetrain ? DRIVE_LABEL[l.drivetrain] : null, l.seller_type === "private" ? (l.source === "private" ? "Private seller · phone verified" : "Private seller") : l.dealer_name].filter(Boolean).join(" · ")}
        </p>
        {(card.reasons.length > 0 || card.badges.length > 0) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {card.reasons.map((r) => <Pill key={r.key} tone="accent">{r.text}</Pill>)}
            {card.badges.filter((b) => b.kind !== "promoted").map((b) => <Pill key={b.text} tone="fair">{b.text}</Pill>)}
          </div>
        )}
      </button>
    </motion.article>
  );
});

function Stamp({ children, className, style }: { children: React.ReactNode; className?: string; style: { opacity: MotionValue<number> } }) {
  return (
    <motion.span
      aria-hidden
      style={style}
      className={cn("pointer-events-none absolute top-8 rounded-xl border-4 px-3 py-1 text-3xl font-bold tracking-widest", className)}
    >
      {children}
    </motion.span>
  );
}

/** Static preview of the next card under the top one. */
export function CardPreview({ card, depth }: { card: DeckCard; depth: number }) {
  const l = card.listing;
  return (
    <div
      aria-hidden
      className="absolute inset-0 flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-white/5 bg-navy-900"
      style={{ transform: `scale(${1 - depth * 0.04}) translateY(${depth * 14}px)`, opacity: depth > 1 ? 0.5 : 1 }}
    >
      <div className="relative min-h-0 flex-1">
        <CarPhoto photos={l.photos.slice(0, 1)} alt="" className="size-full" interactive={false} />
      </div>
      <div className="px-5 pt-4 pb-5">
        <p className="text-[2rem] font-bold leading-none">{usd(l.price)}</p>
        <p className="mt-3 text-lg font-bold">{listingTitle(l, true)}</p>
      </div>
    </div>
  );
}
