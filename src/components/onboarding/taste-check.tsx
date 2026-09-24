"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/primitives";

interface Slim { id: string; photo: string; title: string; color: string | null }
interface Pair { a: Slim; b: Slim }

/** Three "which looks better?" picks that seed the visual taste vector. */
export function TasteCheck({ onDone }: { onDone: (picks: { chosen: string[]; rejected: string[] }) => void }) {
  const [pairs, setPairs] = useState<Pair[] | null>(null);
  const [step, setStep] = useState(0);
  const [chosen, setChosen] = useState<string[]>([]);
  const [rejected, setRejected] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/onboarding/taste").then((r) => r.json()).then((d: { pairs?: Pair[] }) => {
      const p = d.pairs ?? [];
      if (!p.length) onDone({ chosen: [], rejected: [] });
      setPairs(p);
    }).catch(() => onDone({ chosen: [], rejected: [] }));
  }, [onDone]);

  if (!pairs) return <div className="grid grid-cols-2 gap-3"><Skeleton className="aspect-[4/3]" /><Skeleton className="aspect-[4/3]" /></div>;
  const pair = pairs[step];
  if (!pair) return null;

  const pick = (win: Slim, lose: Slim) => {
    const c = [...chosen, win.id];
    const r = [...rejected, lose.id];
    setChosen(c);
    setRejected(r);
    if (step + 1 >= pairs.length) onDone({ chosen: c, rejected: r });
    else setStep(step + 1);
  };

  return (
    <div>
      <p className="mb-3 text-center text-sm font-bold text-muted">Which looks better? {step + 1} of {pairs.length}</p>
      <motion.div key={step} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-2 gap-3">
        {[[pair.a, pair.b], [pair.b, pair.a]].map(([win, lose]) => (
          <button key={win.id} onClick={() => pick(win, lose)} className="group overflow-hidden rounded-3xl border border-line bg-navy-850 text-left transition hover:border-accent cursor-pointer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={win.photo} alt={win.title} className="aspect-[4/3] w-full object-cover transition group-hover:scale-[1.03]" />
            <span className="block px-3 py-2 text-xs font-bold text-muted">{win.title}</span>
          </button>
        ))}
      </motion.div>
    </div>
  );
}
