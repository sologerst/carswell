"use client";

import { motion } from "motion/react";

const COLORS = ["#6d5efc", "#9d8cff", "#38bdf8", "#ffffff", "#22c55e"];
// Deterministic scatter (pure render): a hash of the piece index in [0, 1).
const rand = (n: number) => {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};
const PIECES = Array.from({ length: 48 }, (_, i) => ({
  x: (rand(i) - 0.5) * 700,
  y: -250 - rand(i + 100) * 350,
  r: rand(i + 200) * 540 - 270,
  c: COLORS[i % COLORS.length],
  d: 0.9 + rand(i + 300) * 0.8,
}));

/** The single celebratory moment: an offer is picked. */
export function Celebrate({ title, body }: { title: string; body: string }) {
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-navy-950/80 backdrop-blur-sm" role="alert">
      <div className="pointer-events-none absolute left-1/2 top-1/2">
        {PIECES.map((p, i) => (
          <motion.span key={i} className="absolute block h-3 w-2 rounded-sm" style={{ background: p.c }}
            initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
            animate={{ x: p.x, y: [0, p.y, p.y + 700], opacity: [1, 1, 0], rotate: p.r }}
            transition={{ duration: p.d * 1.6, ease: "easeOut" }} />
        ))}
      </div>
      <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 18 }} className="relative mx-6 max-w-sm rounded-[2rem] bg-navy-800 p-8 text-center shadow-2xl">
        <p className="text-4xl">🔑</p>
        <p className="mt-3 text-2xl font-bold">{title}</p>
        <p className="mt-2 text-muted">{body}</p>
      </motion.div>
    </div>
  );
}
