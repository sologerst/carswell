"use client";

import { CalendarClock, Clock, MapPin } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Pill } from "@/components/ui/primitives";
import { relativeTime, usd } from "@/lib/format";
import type { Lead } from "@/lib/server/dealer";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "new", label: "New", statuses: ["sent"] },
  { key: "offered", label: "Offered", statuses: ["offered"] },
  { key: "matched", label: "Matched", statuses: ["matched", "purchased"] },
  { key: "expired", label: "Expired", statuses: ["expired", "declined", "unavailable"] },
] as const;

const FIT = { fits: { text: "Fits budget", tone: "good" }, stretch: { text: "Slight stretch", tone: "fair" }, over: { text: "Over budget", tone: "bad" }, unknown: { text: "Budget n/a", tone: "default" } } as const;

function timer(sla: string | null): { text: string; urgent: boolean } | null {
  if (!sla) return null;
  const ms = new Date(sla).getTime() - Date.now();
  if (ms <= 0) return { text: "Reply window passed", urgent: true };
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return { text: h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h left` : `${h}h ${m}m left`, urgent: h < 6 };
}

export function DealerInbox({ leads, dealerName, basePath = "/dealer/leads", intro, heading = "Leads" }: {
  leads: Lead[];
  dealerName: string;
  /** Lead detail links; the private-seller inbox reuses this view. */
  basePath?: string;
  intro?: string;
  heading?: string;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("new");
  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.key, leads.filter((l) => (t.statuses as readonly string[]).includes(l.status)).length])), [leads]);
  const shown = leads.filter((l) => (TABS.find((t) => t.key === tab)!.statuses as readonly string[]).includes(l.status));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{heading}</h1>
          <p className="text-sm text-muted">{dealerName} · {intro ?? "buyers who liked your cars. Answer with an out-the-door offer; contact details unlock when they pick yours."}</p>
        </div>
      </div>
      <div role="tablist" className="mb-4 flex gap-1 overflow-x-auto rounded-full bg-navy-900 p-1 scrollbar-none sm:inline-flex">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={cn("tap shrink-0 rounded-full px-4 text-sm font-bold cursor-pointer", tab === t.key ? "bg-navy-700 text-ink" : "text-muted hover:text-ink")}>
            {t.label} <span className="ml-1 text-subtle">{counts[t.key]}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-line px-6 py-16 text-center text-muted">No leads here yet.</p>
      ) : (
        <ul className="grid gap-3 xl:grid-cols-2">
          {shown.map((l) => {
            const p = l.dossier.preferences;
            const t = l.status === "sent" ? timer(l.sla_expires_at) : null;
            const fit = FIT[l.budgetFit];
            return (
              <li key={l.interest_id}>
                <Link href={`${basePath}/${l.interest_id}`} className="flex gap-4 rounded-3xl border border-line bg-navy-900 p-4 transition hover:border-navy-500">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {l.listing_photo && <img src={l.listing_photo} alt="" className="hidden h-24 w-32 shrink-0 rounded-2xl object-cover sm:block" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-bold">{l.dossier.first_name ?? "Buyer"}</p>
                      {l.kind === "superlike" && <Pill tone="drive"><CalendarClock className="size-3" /> Test drive</Pill>}
                      {l.budgetFit !== "unknown" && <Pill tone={fit.tone}>{fit.text}</Pill>}
                      {t && <span className={cn("ml-auto inline-flex items-center gap-1 text-xs font-bold", t.urgent ? "text-deal-bad" : "text-muted")}><Clock className="size-3.5" /> {t.text}</span>}
                    </div>
                    <p className="truncate text-sm">{l.listing_title} · {usd(l.listing_price)}</p>
                    <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
                      {l.distance_mi !== null && <span className="inline-flex items-center gap-1"><MapPin className="size-3" />{Math.round(l.distance_mi)} mi</span>}
                      <span>{p?.budget_mode === "cash" ? "Cash" : p?.max_monthly_payment ? `$${p.max_monthly_payment}/mo` : "Budget n/a"}</span>
                      <span>{p?.financing_status === "preapproved" ? "Pre-approved" : p?.financing_status === "cash" ? "Cash" : "Needs financing"}</span>
                      <span>{(p?.trade_in as { has?: boolean } | undefined)?.has ? "Has trade" : "No trade"}</span>
                      <span>{({ week: "Buying this week", month: "This month", quarter: "1-3 months", browsing: "Browsing" } as Record<string, string>)[String(p?.timeline)] ?? ""}</span>
                    </p>
                    {l.lead_summary && <p className="mt-2 line-clamp-2 text-sm text-muted">{l.lead_summary}</p>}
                    <p className="mt-2 text-xs text-subtle">
                      {relativeTime(l.created_at)}{l.offer_count ? ` · ${l.offer_count} offer${l.offer_count > 1 ? "s" : ""}${l.best_offer_otd ? `, best ${usd(l.best_offer_otd)}` : ""}` : ""}{l.buyer_notes.length ? " · buyer sent a note" : ""}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
