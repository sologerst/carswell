"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, Input, Label, SectionTitle, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { usd } from "@/lib/format";
import { monthlyPayment, outTheDoor, priceForOtd, type TaxConfig } from "@/lib/money";
import { createClient } from "@/lib/supabase/client";
import type { TradeIn } from "@/lib/types";

const num = (s: string) => Number(s.replace(/[^\d.]/g, "")) || 0;

export interface OpenCounter {
  id: string;
  amount_otd: number;
  body: string | null;
  created_at: string;
}

/**
 * Out-the-door offer: price, fees, TN tax (auto-calculated), trade estimate,
 * optional financing terms and notes, with a buyer preview. Private sellers
 * get a simpler form (no dealer fees or trades; tax is paid at the county
 * clerk). An open counteroffer can be matched or declined here.
 */
export function SendOfferForm({ interestId, listingPrice, docFee, tax, trade, buyerName, title, mode = "dealer", counter = null }: {
  interestId: string;
  listingPrice: number;
  docFee: number;
  tax: TaxConfig;
  trade: TradeIn | null;
  buyerName: string;
  title: string;
  mode?: "dealer" | "private";
  counter?: OpenCounter | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const isPrivate = mode === "private";
  const [price, setPrice] = useState(String(Math.round(listingPrice)));
  const [doc, setDoc] = useState(isPrivate ? "0" : String(docFee));
  const [fees, setFees] = useState("0");
  const [tradeValue, setTradeValue] = useState(!isPrivate && trade?.has ? String(trade.value ?? "") : "");
  const [payoff] = useState(!isPrivate && trade?.has ? trade.payoff ?? 0 : 0);
  const [notes, setNotes] = useState("");
  const [days, setDays] = useState("7");
  const [financing, setFinancing] = useState(false);
  const [apr, setApr] = useState("");
  const [term, setTerm] = useState("72");
  const [down, setDown] = useState("");
  const [lender, setLender] = useState("");
  const [busy, setBusy] = useState(false);

  const otd = useMemo(() => outTheDoor({
    price: num(price), docFee: num(doc), dealerFees: num(fees),
    trade: tradeValue ? { has: true, value: num(tradeValue), payoff } : null,
  }, tax), [price, doc, fees, tradeValue, payoff, tax]);
  const monthly = financing && num(apr) > 0 && num(term) > 0 ? monthlyPayment(otd.total - num(down), num(apr), num(term)) : null;

  function matchCounter() {
    if (!counter) return;
    const p = priceForOtd(counter.amount_otd, { docFee: num(doc), dealerFees: num(fees), trade: tradeValue ? { has: true, value: num(tradeValue), payoff } : null }, tax);
    setPrice(String(p));
    setNotes((n) => n || "We can meet your number.");
  }

  async function declineCounter() {
    if (!counter) return;
    const { error } = await createClient().rpc("decline_counter", { p_counter_id: counter.id });
    if (error) return toast(error.message, "error");
    toast("Counteroffer declined. Your offer still stands.");
    router.refresh();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await createClient().rpc("send_offer", {
      p_interest_id: interestId,
      p_offer: {
        vehicle_price: num(price), doc_fee: num(doc), dealer_fees: num(fees), tax: otd.tax.total,
        title_fees: otd.titleRegistration, trade_credit: otd.tradeValue, otd_total: otd.total, notes, valid_days: Number(days),
        ...(financing ? { apr: num(apr) || null, term_months: num(term) || null, down_payment: num(down) || null, lender: lender || null, monthly_estimate: monthly } : {}),
      },
    });
    setBusy(false);
    if (error) return toast(error.message, "error");
    toast(`${isPrivate ? "Price" : "Offer"} sent to ${buyerName}.`, "success");
    router.refresh();
  }

  return (
    <Card className="p-5">
      <SectionTitle>{isPrivate ? "Send your price" : "Send an out-the-door offer"}</SectionTitle>
      {counter && (
        <div className="mb-4 rounded-2xl border border-drive/40 bg-drive/10 p-4 text-sm">
          <p className="font-bold text-drive">{buyerName} countered at {usd(counter.amount_otd)} out the door</p>
          {counter.body && <p className="mt-1 whitespace-pre-wrap text-muted">&ldquo;{counter.body}&rdquo;</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={matchCounter}>Match {usd(counter.amount_otd)}</Button>
            <Button type="button" size="sm" variant="ghost" onClick={declineCounter}>Decline</Button>
          </div>
          <p className="mt-2 text-xs text-subtle">Or send a new number below; it answers the counter.</p>
        </div>
      )}
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div><Label htmlFor="price">Vehicle price</Label><Input id="price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
          {!isPrivate && (
            <>
              <div><Label htmlFor="doc">Doc fee</Label><Input id="doc" inputMode="decimal" value={doc} onChange={(e) => setDoc(e.target.value)} /></div>
              <div><Label htmlFor="fees">Other dealer fees</Label><Input id="fees" inputMode="decimal" value={fees} onChange={(e) => setFees(e.target.value)} /></div>
              <div><Label htmlFor="trade">Trade estimate</Label><Input id="trade" inputMode="decimal" value={tradeValue} onChange={(e) => setTradeValue(e.target.value)} placeholder={trade?.has ? "Buyer has a trade" : "No trade"} /></div>
            </>
          )}
        </div>

        {!isPrivate && (
          <div className="rounded-2xl border border-line p-4">
            <label className="flex items-center gap-2 text-sm font-bold">
              <input type="checkbox" className="size-4 accent-[var(--color-accent)]" checked={financing} onChange={(e) => setFinancing(e.target.checked)} />
              Include financing terms
            </label>
            {financing && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div><Label htmlFor="apr">APR %</Label><Input id="apr" inputMode="decimal" value={apr} onChange={(e) => setApr(e.target.value)} placeholder="7.9" /></div>
                <div><Label htmlFor="term">Term (months)</Label><Input id="term" inputMode="numeric" value={term} onChange={(e) => setTerm(e.target.value.replace(/\D/g, ""))} /></div>
                <div><Label htmlFor="down">Down payment</Label><Input id="down" inputMode="decimal" value={down} onChange={(e) => setDown(e.target.value)} /></div>
                <div><Label htmlFor="lender">Lender</Label><Input id="lender" value={lender} onChange={(e) => setLender(e.target.value)} placeholder="e.g. Local credit union" /></div>
                <p className="col-span-2 text-xs text-subtle">Shown with APR, term and down payment. Subject to credit approval.</p>
              </div>
            )}
          </div>
        )}

        <div><Label htmlFor="notes">Notes</Label><Textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={isPrivate ? "Happy to meet at the bank on Saturday." : "Fresh detail, full tank, happy to show it Saturday."} /></div>
        <div><Label htmlFor="days">{isPrivate ? "Price good for (days)" : "Offer valid for (days)"}</Label><Input id="days" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} /></div>

        <div className="rounded-2xl border border-line bg-navy-850 p-4 text-sm">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-subtle">What {buyerName} sees</p>
          <p className="text-xs text-muted">{title}</p>
          <p className="my-1 text-3xl font-bold">{usd(otd.total)}</p>
          {monthly !== null && <p className="text-sm text-muted">{usd(monthly)}/mo · {num(apr)}% APR · {num(term)} mo{num(down) ? ` · ${usd(num(down))} down` : ""}</p>}
          <dl className="space-y-1 text-muted">
            <Line k="Vehicle price" v={usd(otd.price)} />
            {!isPrivate && <Line k="Doc + dealer fees" v={usd(otd.docFee + otd.dealerFees)} />}
            <Line k={isPrivate ? "TN sales tax (paid at the county clerk, est.)" : "TN sales tax (auto)"} v={usd(otd.tax.total)} />
            <Line k="Title & registration (est.)" v={usd(otd.titleRegistration)} />
            {otd.tradeValue > 0 && <Line k="Trade credit" v={`−${usd(otd.tradeValue)}`} />}
            {otd.tradePayoff > 0 && <Line k="Trade payoff" v={usd(otd.tradePayoff)} />}
          </dl>
          <p className="mt-2 text-[11px] text-subtle">Tax: 7% state on {usd(otd.taxable)} + local and single-article tax. [VERIFY TN rates]</p>
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={busy || num(price) <= 0}>{busy ? "Sending…" : isPrivate ? "Send price" : "Send offer"}</Button>
      </form>
    </Card>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-3"><dt>{k}</dt><dd className="font-bold text-ink">{v}</dd></div>;
}
