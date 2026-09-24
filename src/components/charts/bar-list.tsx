"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";

export interface BarRow {
  key: string;
  label: string;
  sublabel?: string;
  value: number;
  /** Shown at the bar tip. */
  valueLabel: string;
  /** Optional context marker on the same scale (e.g. peers), drawn as a tick. */
  marker?: number;
  /** Extra tooltip lines: [label, value]. */
  details?: [string, string][];
}

/**
 * Horizontal single-series bars (magnitude). One hue, thin marks (12px),
 * 4px rounded data-end, square at the baseline, value at the tip. Every bar
 * is focusable and shows a tooltip on hover and focus; "Show table" gives
 * the same numbers without hovering.
 */
export function BarList({ rows, title, valueHeader, markerLabel, max }: {
  rows: BarRow[];
  title: string;
  valueHeader: string;
  markerLabel?: string;
  max?: number;
}) {
  const [active, setActive] = useState<string | null>(null);
  const [table, setTable] = useState(false);
  const id = useId();
  const top = max ?? Math.max(1, ...rows.map((r) => Math.max(r.value, r.marker ?? 0)));

  if (!rows.length) return <p className="text-sm text-muted">Not enough buyers yet to report this without identifying anyone.</p>;

  return (
    <figure aria-labelledby={`${id}-t`}>
      <figcaption id={`${id}-t`} className="sr-only">{title}</figcaption>
      {table ? (
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-subtle">
            <tr><th className="py-2">Item</th><th className="text-right">{valueHeader}</th>{markerLabel && <th className="text-right">{markerLabel}</th>}{rows[0]?.details?.map(([k]) => <th key={k} className="text-right">{k}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-line tabular-nums">
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="py-2">{r.label}{r.sublabel ? <span className="text-muted"> · {r.sublabel}</span> : null}</td>
                <td className="text-right">{r.valueLabel}</td>
                {markerLabel && <td className="text-right">{r.marker ?? "–"}</td>}
                {r.details?.map(([k, v]) => <td key={k} className="text-right">{v}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const pct = Math.max(0.5, (r.value / top) * 100);
            const open = active === r.key;
            return (
              <li key={r.key}>
                <div
                  tabIndex={0}
                  role="group"
                  aria-label={`${r.label}: ${r.valueLabel}`}
                  onPointerEnter={() => setActive(r.key)}
                  onPointerLeave={() => setActive((a) => (a === r.key ? null : a))}
                  onFocus={() => setActive(r.key)}
                  onBlur={() => setActive((a) => (a === r.key ? null : a))}
                  className="relative rounded-xl px-1 py-1 outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate font-bold">{r.label}{r.sublabel && <span className="font-normal text-muted"> · {r.sublabel}</span>}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative h-3 flex-1">
                      <div
                        className={cn("absolute inset-y-0 left-0 rounded-r-[4px] transition-[filter]", open && "brightness-125")}
                        style={{ width: `${pct}%`, background: "var(--color-chart-1)" }}
                      />
                      {r.marker !== undefined && (
                        <div aria-hidden className="absolute -inset-y-1 w-0.5 rounded-full bg-muted" style={{ left: `calc(${Math.min(100, (r.marker / top) * 100)}% - 1px)` }} />
                      )}
                    </div>
                    <span className="w-20 shrink-0 text-right text-sm tabular-nums text-ink">{r.valueLabel}</span>
                  </div>
                  {open && (r.details?.length || r.marker !== undefined) ? (
                    <div role="tooltip" className="absolute top-full left-2 z-10 mt-1 min-w-48 rounded-2xl border border-line bg-navy-850 px-3 py-2 text-xs shadow-xl">
                      <p className="mb-1 font-bold text-ink">{r.label}</p>
                      <dl className="space-y-0.5">
                        <div className="flex justify-between gap-4"><dt className="text-muted">{valueHeader}</dt><dd className="font-bold text-ink">{r.valueLabel}</dd></div>
                        {markerLabel && r.marker !== undefined && <div className="flex justify-between gap-4"><dt className="text-muted">{markerLabel}</dt><dd className="font-bold text-ink">{r.marker}</dd></div>}
                        {r.details?.map(([k, v]) => <div key={k} className="flex justify-between gap-4"><dt className="text-muted">{k}</dt><dd className="font-bold text-ink">{v}</dd></div>)}
                      </dl>
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-3 flex items-center gap-4 text-xs text-muted">
        {markerLabel && !table && <span className="inline-flex items-center gap-1.5"><span aria-hidden className="inline-block h-3 w-0.5 rounded-full bg-muted" /> {markerLabel}</span>}
        <button type="button" className="ml-auto font-bold underline cursor-pointer" onClick={() => setTable((t) => !t)}>{table ? "Show chart" : "Show table"}</button>
      </div>
    </figure>
  );
}

/** Stat tile: label, value (proportional figures), optional context line. */
export function StatTile({ label, value, context }: { label: string; value: string; context?: string }) {
  return (
    <div className="rounded-3xl border border-line bg-navy-900 p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-3xl font-bold tracking-tight">{value}</p>
      {context && <p className="mt-1 text-xs text-subtle">{context}</p>}
    </div>
  );
}
