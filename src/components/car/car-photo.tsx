"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Car photo with tap-left / tap-right to cycle. Landscape photos are shown
 * whole ("contain") over a blurred copy, so portrait cards never crop the car.
 */
export function CarPhoto({
  photos, alt, className, interactive = true, onCycle, priority,
}: {
  photos: string[];
  alt: string;
  className?: string;
  interactive?: boolean;
  onCycle?: (index: number) => void;
  priority?: boolean;
}) {
  const [i, setI] = useState(0);
  const src = photos[i] ?? photos[0];
  const go = (delta: number) => {
    const next = (i + delta + photos.length) % photos.length;
    setI(next);
    onCycle?.(next);
  };
  return (
    <div className={cn("relative overflow-hidden bg-navy-900", className)}>
      {src ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" aria-hidden className="absolute inset-0 size-full scale-110 object-cover opacity-70 blur-2xl" draggable={false} />
          <div aria-hidden className="absolute inset-0 bg-navy-950/55" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} className="relative size-full object-contain" draggable={false} loading={priority ? "eager" : "lazy"} decoding="async" />
        </>
      ) : (
        <div className="grid size-full place-items-center text-muted">No photo</div>
      )}
      {interactive && photos.length > 1 && (
        <>
          <button type="button" aria-label="Previous photo" className="absolute inset-y-0 left-0 w-1/3 cursor-pointer" onClick={(e) => { e.stopPropagation(); go(-1); }} />
          <button type="button" aria-label="Next photo" className="absolute inset-y-0 right-0 w-1/3 cursor-pointer" onClick={(e) => { e.stopPropagation(); go(1); }} />
          <div className="pointer-events-none absolute inset-x-3 top-3 flex gap-1">
            {photos.map((p, n) => (
              <span key={p + n} className={cn("h-1 flex-1 rounded-full", n === i ? "bg-white" : "bg-white/35")} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
