import * as React from "react";
import type { DealRating } from "@/lib/types";
import { DEAL_LABEL, DEAL_TONE } from "@/lib/deal";
import { cn } from "@/lib/utils";

export function Chip({
  selected, className, children, ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "tap inline-flex items-center justify-center gap-1.5 rounded-full border px-4 text-sm font-bold transition-colors cursor-pointer",
        selected ? "border-accent bg-accent text-white" : "border-line bg-navy-850 text-ink hover:border-navy-500",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Pill({ className, children, tone = "default" }: { className?: string; children: React.ReactNode; tone?: "default" | "accent" | "good" | "fair" | "bad" | "drive" }) {
  const tones = {
    default: "bg-white/10 text-ink",
    accent: "bg-accent/20 text-accent-soft",
    good: "bg-deal-good/15 text-deal-good",
    fair: "bg-deal-fair/15 text-deal-fair",
    bad: "bg-deal-bad/15 text-deal-bad",
    drive: "bg-drive/15 text-drive",
  };
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold", tones[tone], className)}>{children}</span>;
}

export function DealBadge({ rating, className }: { rating: DealRating | null; className?: string }) {
  if (!rating) return null;
  const tone = DEAL_TONE[rating];
  return <Pill tone={tone === "good" ? "good" : tone === "neutral" ? "fair" : "bad"} className={className}>{DEAL_LABEL[rating]}</Pill>;
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn("h-12 w-full rounded-2xl border border-line bg-navy-850 px-4 text-base text-ink placeholder:text-subtle focus:border-accent focus:outline-none", className)}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn("w-full rounded-2xl border border-line bg-navy-850 px-4 py-3 text-base text-ink placeholder:text-subtle focus:border-accent focus:outline-none", className)}
      {...props}
    />
  );
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1.5 block text-sm font-bold text-muted", className)} {...props} />;
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-3xl border border-line bg-navy-900", className)} {...props} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-2xl bg-navy-800", className)} />;
}

export function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h2 className={cn("mb-3 text-xs font-bold uppercase tracking-[0.14em] text-subtle", className)}>{children}</h2>;
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <p className="text-lg font-bold">{title}</p>
      {body && <p className="max-w-sm text-muted">{body}</p>}
      {action}
    </div>
  );
}
