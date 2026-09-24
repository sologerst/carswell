"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Pill, Textarea } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { usd } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { api } from "@/lib/utils";

interface CounterResponse {
  suggestion: { targetOtd: number; savings: number; confidence: "low" | "medium" | "high"; reasons: string[]; askToRemoveFees: number };
  targetOtd: number;
  message: { body: string; source: "ai" | "template" };
}

/** Negotiator v2: suggested counter with reasons + a drafted message. The buyer edits and sends. */
export function CounterSheet({ offerId, offerOtd, title, open, onOpenChange }: {
  offerId: string; offerOtd: number; title: string; open: boolean; onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState<CounterResponse | null>(null);
  const [amount, setAmount] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || data) return;
    let alive = true;
    api<CounterResponse>("/api/agent/counter", { json: { offerId } })
      .then((res) => {
        if (!alive) return;
        setData(res);
        setAmount(String(res.targetOtd));
        setBody(res.message.body);
      })
      .catch((e) => toast((e as Error).message, "error"));
    return () => { alive = false; };
  }, [open, data, offerId, toast]);

  async function send() {
    setBusy(true);
    const { error } = await createClient().rpc("send_counter", { p_offer_id: offerId, p_amount: Number(amount), p_body: body });
    setBusy(false);
    if (error) return toast(error.message, "error");
    toast("Counteroffer sent.", "success");
    onOpenChange(false);
    router.refresh();
  }

  const n = Number(amount) || 0;
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Make a counteroffer" description={`${title} · their offer ${usd(offerOtd)} out the door`}>
      {!data ? (
        <p className="flex items-center gap-2 py-8 text-muted"><Loader2 className="animate-spin" /> Working out a fair number…</p>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl bg-navy-850 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-muted">Suggested counter</p>
              <Pill tone={data.suggestion.confidence === "high" ? "good" : data.suggestion.confidence === "medium" ? "fair" : "default"}>{data.suggestion.confidence} confidence</Pill>
            </div>
            <p className="text-3xl font-bold">{usd(data.targetOtd)}</p>
            <p className="text-sm text-muted">{usd(data.suggestion.savings)} less than their offer</p>
            {data.suggestion.reasons.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">{data.suggestion.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
          </div>
          <div>
            <Label htmlFor="counter-amount">Your counter (out the door)</Label>
            <Input id="counter-amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} />
            {n >= offerOtd && <p className="mt-1 text-sm text-deal-bad">A counter should be below their offer.</p>}
          </div>
          <div>
            <Label htmlFor="counter-body" className="flex items-center gap-1.5">{data.message.source === "ai" && <Sparkles className="size-4 text-accent-soft" />} Message (edit before sending)</Label>
            <Textarea id="counter-body" rows={6} value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} />
          </div>
          <Button size="lg" className="w-full" onClick={send} disabled={busy || n <= 0 || n >= offerOtd}>Send counteroffer</Button>
          <p className="text-xs text-subtle">The seller can accept by sending a new offer at your number, reply with a different price, or decline. Your current offer stays open until it expires.</p>
        </div>
      )}
    </Sheet>
  );
}
