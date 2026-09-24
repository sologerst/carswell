"use client";

import { ImagePlus, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, Chip, Input, Label, SectionTitle } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { usd } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { TradeIn } from "@/lib/types";
import { api, uuid } from "@/lib/utils";

type Condition = "excellent" | "good" | "fair" | "rough";
interface Estimate { range: { low: number; high: number } | null; reason?: string; condition?: Condition; retail?: number | null; comps?: number; notes?: string[]; adjusted?: boolean }

const CONDITIONS: [Condition, string, string][] = [
  ["excellent", "Excellent", "Like new, no dings, all records"],
  ["good", "Good", "Normal wear, a few small scratches"],
  ["fair", "Fair", "Dents, worn interior or tires, needs some work"],
  ["rough", "Rough", "Major damage, warning lights, needs repairs"],
];

/** Trade-in estimate: market model wholesale band + optional photo notes. */
export function TradeEstimator({ userId, trade }: { userId: string; trade: TradeIn | null }) {
  const router = useRouter();
  const toast = useToast();
  const [f, setF] = useState({ year: "", make: "", model: "", trim: "", miles: "" });
  const [condition, setCondition] = useState<Condition>("good");
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [est, setEst] = useState<Estimate | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function addPhotos(files: FileList) {
    const supabase = createClient();
    setBusy(true);
    try {
      const paths: string[] = [];
      for (const file of [...files].slice(0, 6 - photos.length)) {
        const path = `${userId}/${uuid()}.jpg`;
        const { error } = await supabase.storage.from("trade-photos").upload(path, file, { contentType: file.type || "image/jpeg" });
        if (error) throw new Error(error.message);
        paths.push(path);
      }
      setPhotos((p) => [...p, ...paths]);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function estimate() {
    setBusy(true);
    try {
      setEst(await api<Estimate>("/api/trade/estimate", {
        json: { year: Number(f.year), make: f.make, model: f.model, trim: f.trim || null, miles: Number(f.miles.replace(/\D/g, "")), condition, photoPaths: photos },
      }));
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function useValue() {
    if (!est?.range) return;
    const value = Math.round((est.range.low + est.range.high) / 2 / 50) * 50;
    try {
      await api("/api/prefs", {
        method: "PATCH",
        json: { set: { trade_in: { value: { has: true, value, payoff: trade?.payoff ?? 0, description: `${f.year} ${f.make} ${f.model}`.trim() }, tier: "must", source: "said" } } },
      });
      toast(`Trade-in set to ${usd(value)}. Estimates now include it.`, "success");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  return (
    <div className="space-y-5">
      <Card className="space-y-4 p-5">
        <SectionTitle>Your current car</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div><Label htmlFor="t-year">Year</Label><Input id="t-year" inputMode="numeric" maxLength={4} value={f.year} onChange={set("year")} /></div>
          <div><Label htmlFor="t-make">Make</Label><Input id="t-make" value={f.make} onChange={set("make")} /></div>
          <div><Label htmlFor="t-model">Model</Label><Input id="t-model" value={f.model} onChange={set("model")} /></div>
          <div><Label htmlFor="t-trim">Trim</Label><Input id="t-trim" value={f.trim} onChange={set("trim")} /></div>
          <div><Label htmlFor="t-miles">Miles</Label><Input id="t-miles" inputMode="numeric" value={f.miles} onChange={set("miles")} /></div>
        </div>
        <div>
          <Label>Condition</Label>
          <div className="flex flex-wrap gap-2">{CONDITIONS.map(([k, label]) => <Chip key={k} selected={condition === k} onClick={() => setCondition(k)}>{label}</Chip>)}</div>
          <p className="mt-1 text-xs text-subtle">{CONDITIONS.find(([k]) => k === condition)?.[2]}</p>
        </div>
        <div>
          <Label>Photos (optional, up to 6)</Label>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={() => input.current?.click()} disabled={busy || photos.length >= 6}><ImagePlus /> Add photos</Button>
            <span className="text-sm text-muted">{photos.length} added</span>
          </div>
          <input ref={input} type="file" accept="image/*" multiple className="sr-only" aria-label="Trade-in photos" onChange={(e) => e.target.files && addPhotos(e.target.files)} />
        </div>
        <Button size="lg" onClick={estimate} disabled={busy || !f.year || !f.make || !f.model || !f.miles}>{busy ? <Loader2 className="animate-spin" /> : null} Estimate</Button>
      </Card>

      {est && (
        <Card className="space-y-3 p-5" role="status">
          {est.range ? (
            <>
              <p className="text-sm text-muted">Estimated trade-in value</p>
              <p className="text-4xl font-bold">{usd(est.range.low)} – {usd(est.range.high)}</p>
              <p className="text-sm text-muted">Based on {est.comps} similar listings{est.retail ? ` (retail around ${usd(est.retail)})` : ""}. Dealers pay wholesale, below retail asking prices.</p>
              {est.adjusted && <p className="text-sm text-deal-fair">Adjusted to &ldquo;{est.condition}&rdquo; condition based on your photos.</p>}
              {est.notes && est.notes.length > 0 && <ul className="list-disc pl-5 text-sm text-muted">{est.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
              <Button onClick={useValue}>Use {usd(Math.round((est.range.low + est.range.high) / 2 / 50) * 50)} as my trade value</Button>
              <p className="text-xs text-subtle">An estimate, not an offer. The dealer appraises the car in person.</p>
            </>
          ) : <p className="text-sm text-muted">{est.reason}</p>}
        </Card>
      )}
    </div>
  );
}
