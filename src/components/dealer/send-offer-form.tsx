"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, Input, Label, SectionTitle, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { usd } from "@/lib/format";
import { outTheDoor, type TaxConfig } from "@/lib/money";
import { createClient } from "@/lib/supabase/client";
import type { TradeIn } from "@/lib/types";

const num = (s: string) => Number(s.replace(/[^\d.]/g, "")) || 0;

/** Out-the-door offer: price, fees, TN tax (auto-calculated), trade estimate, notes, with a buyer preview. */
export function SendOfferForm({ interestId, listingPrice, docFee, tax, trade, buyerName, title }: {
  interestId: string; listingPrice: number; docFee: number; tax: TaxConfig; trade: TradeIn | null; buyerName: string; title: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [price, setPrice] = useState(String(Math.round(listingPrice)));
  const [doc, setDoc] = useState(String(docFee));
  const [fees, setFees] = useState("0");
  const [tradeValue, setTradeValue] = useState(trade?.has ? String(trade.value ?? "") : "");
  const [payoff] = useState(trade?.has ? trade.payoff ?? 0 : 0);
  const [notes, setNotes] = useState("");
  const [days, setDays] = useState("7");
  const [busy, setBusy] = useState(false);

  const otd = useMemo(() => outTheDoor({
    price: num(price), docFee: num(doc), dealerFees: num(fees),
    trade: tradeValue ? { has: true, value: num(tradeValue), payoff } : null,
  }, tax), [price, doc, fees, tradeValue, payoff, tax]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await createClient().rpc("send_offer", {
      p_interest_id: interestId,
      p_offer: {
        vehicle_price: num(price), doc_fee: num(doc), dealer_fees: num(fees), tax: otd.tax.total,
        title_fees: otd.titleRegistration, trade_credit: otd.tradeValue, otd_total: otd.total, notes, valid_days: Number(days),
      },
    });
    setBusy(false);
    if (error) return toast(error.message, "error");
    toast(`Offer sent to ${buyerName}.`, "success");
    router.refresh();
  }

  return (
    <Card className="p-5">
      <SectionTitle>Send an out-the-door offer</SectionTitle>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div><Label htmlFor="price">Vehicle price</Label><Input id="price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
          <div><Label htmlFor="doc">Doc fee</Label><Input id="doc" inputMode="decimal" value={doc} onChange={(e) => setDoc(e.target.value)} /></div>
          <div><Label htmlFor="fees">Other dealer fees</Label><Input id="fees" inputMode="decimal" value={fees} onChange={(e) => setFees(e.target.value)} /></div>
          <div><Label htmlFor="trade">Trade estimate</Label><Input id="trade" inputMode="decimal" value={tradeValue} onChange={(e) => setTradeValue(e.target.value)} placeholder={trade?.has ? "Buyer has a trade" : "No trade"} /></div>
        </div>
        <div><Label htmlFor="notes">Notes</Label><Textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Fresh detail, full tank, happy to show it Saturday." /></div>
        <div><Label htmlFor="days">Offer valid for (days)</Label><Input id="days" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} /></div>

        <div className="rounded-2xl border border-line bg-navy-850 p-4 text-sm">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-subtle">What {buyerName} sees</p>
          <p className="text-xs text-muted">{title}</p>
          <p className="my-1 text-3xl font-bold">{usd(otd.total)}</p>
          <dl className="space-y-1 text-muted">
            <Line k="Vehicle price" v={usd(otd.price)} />
            <Line k="Doc + dealer fees" v={usd(otd.docFee + otd.dealerFees)} />
            <Line k={`TN sales tax (auto)`} v={usd(otd.tax.total)} />
            <Line k="Title & registration (est.)" v={usd(otd.titleRegistration)} />
            {otd.tradeValue > 0 && <Line k="Trade credit" v={`−${usd(otd.tradeValue)}`} />}
            {otd.tradePayoff > 0 && <Line k="Trade payoff" v={usd(otd.tradePayoff)} />}
          </dl>
          <p className="mt-2 text-[11px] text-subtle">Tax: 7% state on {usd(otd.taxable)} + local and single-article tax. [VERIFY TN rates]</p>
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={busy || num(price) <= 0}>{busy ? "Sending…" : "Send offer"}</Button>
      </form>
    </Card>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between"><dt>{k}</dt><dd className="font-bold text-ink">{v}</dd></div>;
}
