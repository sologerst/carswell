"use client";

import { Download, Megaphone, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, DealBadge, Input, Label, Pill, SectionTitle } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { usd } from "@/lib/format";
import type { DealRating } from "@/lib/types";
import { api, cn } from "@/lib/utils";

export interface InventoryRow {
  id: string;
  title: string;
  vin: string;
  stock: string | null;
  price: number;
  miles: number;
  photo: string | null;
  deal: DealRating | null;
  state: "live" | "pending" | "sold" | "hidden";
  source: string;
  days: number;
  promotedUntil: string | null;
  impressions: number;
  opens: number;
  likes: number;
  passes: number;
  leads: number;
}

interface FeedInfo { url: string | null; enabled: boolean; lastRunAt: string | null; lastStatus: string | null; lastStats: Record<string, number>; lastError: string | null }
interface ImportResult { rows: number; inserted: number; updated: number; removed: number; skipped: number; errors: { line: number; vin: string | null; error: string }[]; unmapped: string[]; pendingVerification: boolean }

const TABS = [["live", "Live"], ["pending", "Pending"], ["sold", "Sold"]] as const;

export function InventoryView({ rows, feed, promotionPrice, promotionDays, promotionSharePct, sampleCsv }: {
  rows: InventoryRow[]; feed: FeedInfo; promotionPrice: number; promotionDays: number; promotionSharePct: number; sampleCsv: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("live");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [feedUrl, setFeedUrl] = useState(feed.url ?? "");
  const [feedOn, setFeedOn] = useState(feed.enabled);
  const [replace, setReplace] = useState(true);
  const [result, setResult] = useState<ImportResult | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const shown = useMemo(() => rows.filter((r) => (tab === "sold" ? r.state === "sold" || r.state === "hidden" : r.state === tab))
    .filter((r) => !q || `${r.title} ${r.vin} ${r.stock ?? ""}`.toLowerCase().includes(q.toLowerCase())), [rows, tab, q]);
  const counts = Object.fromEntries(TABS.map(([k]) => [k, rows.filter((r) => (k === "sold" ? r.state === "sold" || r.state === "hidden" : r.state === k)).length]));

  async function act(id: string, body: Record<string, unknown>, done?: string) {
    setBusy(id);
    try {
      const res = await api<{ url?: string | null }>(`/api/dealer/listings/${id}`, { json: body });
      if (res.url) { window.location.assign(res.url); return; }
      if (done) toast(done, "success");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  async function upload(f: File) {
    setBusy("feed");
    setResult(null);
    try {
      const form = new FormData();
      form.set("file", f);
      form.set("replace", String(replace));
      const res = await fetch("/api/dealer/feed", { method: "POST", body: form });
      const data = (await res.json()) as ImportResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setResult(data);
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
      if (file.current) file.current.value = "";
    }
  }

  async function saveFeed() {
    try {
      await api("/api/dealer/feed", { json: { url: feedUrl || null, enabled: feedOn } });
      toast("Feed settings saved.", "success");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inventory</h1>
          <p className="text-sm text-muted">How buyers react to each car in the last 30 days. Low like rates usually mean price or photos.</p>
        </div>
        <Input className="h-10 max-w-xs" placeholder="Search VIN, stock, model" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search inventory" />
      </div>

      <div role="tablist" className="inline-flex gap-1 rounded-full bg-navy-900 p-1">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={cn("tap rounded-full px-4 text-sm font-bold cursor-pointer", tab === k ? "bg-navy-700 text-ink" : "text-muted hover:text-ink")}>
            {label} <span className="ml-1 text-subtle">{counts[k]}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-line px-6 py-12 text-center text-muted">{rows.length === 0 ? "No cars yet. Upload a CSV feed below." : "Nothing here."}</p>
      ) : (
        <div className="overflow-x-auto rounded-3xl border border-line">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-navy-900 text-left text-xs uppercase tracking-wider text-subtle">
              <tr>
                <th className="px-4 py-3">Car</th><th className="px-3 py-3">Price</th><th className="px-3 py-3 text-right">Seen</th>
                <th className="px-3 py-3 text-right">Opened</th><th className="px-3 py-3 text-right">Liked</th><th className="px-3 py-3 text-right">Passed</th>
                <th className="px-3 py-3 text-right">Like rate</th><th className="px-3 py-3 text-right">Leads</th><th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {shown.map((r) => {
                const swipes = r.likes + r.passes;
                const rate = swipes ? r.likes / swipes : null;
                const promoted = r.promotedUntil && new Date(r.promotedUntil) > new Date();
                return (
                  <tr key={r.id} className="bg-navy-950">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {r.photo ? <img src={r.photo} alt="" className="h-12 w-16 rounded-lg object-cover" /> : <div className="h-12 w-16 rounded-lg bg-navy-800" />}
                        <div className="min-w-0">
                          <p className="truncate font-bold">{r.title}</p>
                          <p className="truncate text-xs text-muted">{r.stock ? `#${r.stock} · ` : ""}{r.vin} · {r.miles.toLocaleString("en-US")} mi · {r.days}d</p>
                          <div className="mt-1 flex gap-1">{promoted && <Pill tone="accent">Promoted</Pill>}<DealBadge rating={r.deal} /></div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <PriceCell value={r.price} disabled={r.state !== "live" && r.state !== "pending"} onSave={(price) => act(r.id, { action: "price", price }, "Price updated.")} />
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{r.impressions}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{r.opens}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{r.likes}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{r.passes}</td>
                    <td className={cn("px-3 py-3 text-right tabular-nums font-bold", rate !== null && rate < 0.15 && swipes >= 10 ? "text-deal-bad" : "")}>{rate === null ? "–" : `${Math.round(rate * 100)}%`}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{r.leads}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        {r.state === "live" && !promoted && (
                          <Button size="sm" variant="secondary" disabled={busy === r.id} onClick={() => act(r.id, { action: "promote" }, `Promoted for ${promotionDays} days.`)} title={`${usd(promotionPrice)} for ${promotionDays} days`}>
                            <Megaphone /> Promote
                          </Button>
                        )}
                        {r.state === "live" && <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => act(r.id, { action: "sold" }, "Marked sold.")}>Sold</Button>}
                        {(r.state === "sold" || r.state === "hidden") && <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => act(r.id, { action: "relist" }, "Relisted.")}>Relist</Button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-subtle">Promoted cars get a small ranking boost, are capped at {promotionSharePct}% of any buyer&apos;s deck, and always show a &ldquo;Promoted&rdquo; label. {usd(promotionPrice)} for {promotionDays} days.</p>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3 p-5">
          <SectionTitle>Upload a CSV feed</SectionTitle>
          <p className="text-sm text-muted">Columns: VIN and price are required; year, make, model, trim, miles, condition, body, color, photos (URLs separated by |), stock, description and features are used when present. Missing details are filled from the VIN.</p>
          <label className="flex items-center gap-2 text-sm font-bold">
            <input type="checkbox" className="size-4 accent-[var(--color-accent)]" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
            Full feed: mark cars missing from this file as sold
          </label>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => file.current?.click()} disabled={busy === "feed"}><Upload /> {busy === "feed" ? "Importing…" : "Choose CSV"}</Button>
            <Button variant="ghost" asChild><a href={`data:text/csv;charset=utf-8,${encodeURIComponent(sampleCsv)}`} download="carswipe-feed-sample.csv"><Download /> Sample</a></Button>
          </div>
          <input ref={file} type="file" accept=".csv,text/csv" className="sr-only" aria-label="CSV feed file" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
          {result && (
            <div className="rounded-2xl bg-navy-850 p-4 text-sm" role="status">
              <p className="font-bold">{result.inserted} added · {result.updated} updated · {result.removed} marked sold · {result.skipped + result.errors.length} skipped</p>
              {result.pendingVerification && <p className="mt-1 text-deal-fair">Held until your dealership is verified.</p>}
              {result.unmapped.length > 0 && <p className="mt-1 text-muted">Ignored columns: {result.unmapped.join(", ")}</p>}
              {result.errors.length > 0 && <ul className="mt-2 max-h-40 list-disc overflow-y-auto pl-5 text-muted">{result.errors.slice(0, 30).map((e, i) => <li key={i}>{e.line ? `Line ${e.line}: ` : ""}{e.vin ? `${e.vin} ` : ""}{e.error}</li>)}</ul>}
            </div>
          )}
        </Card>
        <Card className="space-y-3 p-5">
          <SectionTitle>Daily feed from a URL</SectionTitle>
          <p className="text-sm text-muted">Point us at the CSV your website or DMS publishes; we pull it every morning.</p>
          <div><Label htmlFor="feed-url">Feed URL (https)</Label><Input id="feed-url" value={feedUrl} onChange={(e) => setFeedUrl(e.target.value)} placeholder="https://your-dms.example.com/feeds/carswipe.csv" /></div>
          <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" className="size-4 accent-[var(--color-accent)]" checked={feedOn} onChange={(e) => setFeedOn(e.target.checked)} /> Pull daily</label>
          <Button variant="secondary" onClick={saveFeed}>Save</Button>
          {feed.lastRunAt && <p className="text-xs text-subtle">Last run {new Date(feed.lastRunAt).toLocaleString("en-US")}: {feed.lastStatus}{feed.lastError ? ` (${feed.lastError})` : ""}</p>}
        </Card>
      </div>
    </div>
  );
}

function PriceCell({ value, disabled, onSave }: { value: number; disabled: boolean; onSave: (v: number) => void }) {
  const [v, setV] = useState(String(Math.round(value)));
  const dirty = Number(v) !== Math.round(value);
  return (
    <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); if (dirty && Number(v) >= 500) onSave(Number(v)); }}>
      <Input aria-label="Price" className="h-9 w-28 rounded-xl px-2 text-sm" inputMode="numeric" value={v} disabled={disabled} onChange={(e) => setV(e.target.value.replace(/\D/g, ""))} />
      {dirty && <Button size="sm" type="submit">Save</Button>}
    </form>
  );
}
