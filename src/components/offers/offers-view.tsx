"use client";

import { ArrowDownRight, Check, Clock, KeyRound, MessageCircle, Star } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DraftTray } from "@/components/agent/draft-tray";
import { CounterSheet } from "@/components/offers/counter-sheet";
import { Button } from "@/components/ui/button";
import { Celebrate } from "@/components/ui/celebrate";
import { Card, Pill } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { relativeTime, usd } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export interface OfferRow {
  id: string;
  status: string;
  source: string;
  otd_total: number;
  vehicle_price: number;
  doc_fee: number;
  dealer_fees: number;
  tax: number;
  title_fees: number;
  trade_credit: number;
  monthly: number | null;
  notes: string | null;
  expires_at: string;
  created_at: string;
  apr: number | null;
  term_months: number | null;
  lender: string | null;
  down_payment: number | null;
  monthly_estimate: number | null;
}

export interface CounterRow { id: string; offer_id: string; amount_otd: number; status: string; created_at: string }

export interface OfferGroup {
  interestId: string;
  status: string;
  kind: string;
  slaExpiresAt: string | null;
  notes: { body: string; at: string }[];
  conversationId: string | null;
  listing: { id: string; title: string; price: number; photo: string | null };
  dealer: { name: string; leadChannel: string; rating: number | null; responseMinutes: number | null } | null;
  privateSale: boolean;
  offers: OfferRow[];
  counters: CounterRow[];
}

export function OffersView({ groups, assumptions, askTradeEstimate }: { groups: OfferGroup[]; assumptions: string; askTradeEstimate: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const supabase = createClient();
  const [celebrate, setCelebrate] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [countering, setCountering] = useState<{ offer: OfferRow; title: string } | null>(null);

  async function pick(g: OfferGroup, o: OfferRow) {
    setBusy(o.id);
    const { data, error } = await supabase.rpc("pick_offer", { p_offer_id: o.id });
    setBusy(null);
    if (error) return toast(error.message, "error");
    setCelebrate(g.listing.title);
    setTimeout(() => router.push(`/chat/${data}`), 2200);
  }

  async function decline(o: OfferRow) {
    setBusy(o.id);
    const { error } = await supabase.rpc("decline_offer", { p_offer_id: o.id });
    setBusy(null);
    if (error) toast(error.message, "error");
    router.refresh();
  }

  async function bought(g: OfferGroup) {
    const picked = g.offers.find((o) => o.status === "picked");
    const { error } = await supabase.rpc("mark_purchased", { p_interest_id: g.interestId, p_price: picked?.otd_total });
    if (error) return toast(error.message, "error");
    toast("Congrats on the new car! 🎉", "success");
    router.refresh();
  }

  async function review(g: OfferGroup, stars: number) {
    const { error } = await supabase.rpc("review_seller", { p_interest_id: g.interestId, p_stars: stars, p_comment: "" });
    if (error) return toast(error.message, "error");
    toast("Thanks for the review.");
  }

  const withOffers = groups.filter((g) => g.offers.length > 0);
  const waiting = groups.filter((g) => g.offers.length === 0 && ["sent", "expired"].includes(g.status));

  return (
    <div className="space-y-10">
      {celebrate && <Celebrate title="It's a match!" body={`The dealer for the ${celebrate} can now chat with you and set up a test drive.`} />}
      {askTradeEstimate && withOffers.length > 0 && (
        <Card className="flex items-center justify-between gap-4 p-4">
          <p className="text-sm"><span className="font-bold">Want an estimate for your trade-in?</span> <span className="text-muted">Add its value so offers compare fairly.</span></p>
          <Button size="sm" variant="secondary" asChild><Link href="/trade">Estimate trade-in</Link></Button>
        </Card>
      )}

      {withOffers.length > 0 && (
        <section className="space-y-6">
          {withOffers.map((g) => {
            const best = Math.min(...g.offers.filter((o) => o.status !== "declined").map((o) => o.otd_total));
            const matched = g.status === "matched" || g.status === "purchased";
            return (
              <Card key={g.interestId} id={g.interestId} className="overflow-hidden">
                <div className="flex items-center gap-4 border-b border-line p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {g.listing.photo && <img src={g.listing.photo} alt="" className="h-16 w-24 shrink-0 rounded-2xl object-cover" />}
                  <div className="min-w-0 flex-1">
                    <Link href={`/car/${g.listing.id}`} className="block truncate font-bold hover:underline">{g.listing.title}</Link>
                    <p className="text-sm text-muted">Listed {usd(g.listing.price)} · {g.dealer?.name ?? (g.privateSale ? "Private seller" : "")}</p>
                  </div>
                  {matched && <Pill tone="good"><Check className="size-3" /> {g.status === "purchased" ? "Bought" : "Matched"}</Pill>}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] text-sm">
                    <thead>
                      <tr className="text-left text-xs text-subtle">
                        <th className="w-40 px-4 py-3 font-bold">Out the door</th>
                        {g.offers.map((o, i) => (
                          <th key={o.id} className="px-4 py-3 font-bold">
                            Offer {i + 1} {o.otd_total === best && o.status !== "declined" && g.offers.length > 1 && <Pill tone="good" className="ml-1">Best</Pill>}
                            {o.source === "email" && <span className="ml-1 font-normal">(by email)</span>}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      <Row label="Total" strong values={g.offers.map((o) => usd(o.otd_total))} dim={g.offers.map((o) => o.status === "declined" || o.status === "expired")} />
                      <Row label="Est. monthly" values={g.offers.map((o) => (o.monthly ? `${usd(o.monthly)}/mo` : "—"))} />
                      <Row label="Vehicle price" values={g.offers.map((o) => usd(o.vehicle_price))} />
                      <Row label="Doc + dealer fees" values={g.offers.map((o) => itemized(o, o.doc_fee + o.dealer_fees))} />
                      <Row label="Tax" values={g.offers.map((o) => itemized(o, o.tax))} />
                      <Row label="Title & registration" values={g.offers.map((o) => itemized(o, o.title_fees))} />
                      <Row label="Trade credit" values={g.offers.map((o) => (o.trade_credit ? `−${usd(o.trade_credit)}` : "—"))} />
                      {g.offers.some((o) => o.apr) && (
                        <Row label="Their financing" values={g.offers.map((o) => (o.apr ? `${o.apr}% APR · ${o.term_months ?? "?"} mo${o.down_payment ? ` · ${usd(o.down_payment)} down` : ""}${o.monthly_estimate ? ` · ${usd(o.monthly_estimate)}/mo` : ""}${o.lender ? ` · ${o.lender}` : ""}` : "—"))} />
                      )}
                      <tr>
                        <td className="px-4 py-3 text-subtle">Status</td>
                        {g.offers.map((o) => (
                          <td key={o.id} className="px-4 py-3">
                            {o.status === "active" && !matched ? (
                              <div className="flex flex-col gap-2">
                                <Button size="sm" onClick={() => pick(g, o)} disabled={busy === o.id}>Pick this offer</Button>
                                <CounterStatus counters={g.counters.filter((c) => c.offer_id === o.id)} />
                                {!g.counters.some((c) => c.offer_id === o.id && c.status === "open") && (
                                  <Button size="sm" variant="secondary" onClick={() => setCountering({ offer: o, title: g.listing.title })}><ArrowDownRight /> Counteroffer</Button>
                                )}
                                <button className="text-xs font-bold text-muted hover:text-ink cursor-pointer" onClick={() => decline(o)}>Decline</button>
                                <span className="inline-flex items-center gap-1 text-xs text-subtle"><Clock className="size-3" /> Expires {relativeTime(o.expires_at)}</span>
                              </div>
                            ) : (
                              <Pill tone={o.status === "picked" ? "good" : "default"}>{o.status === "picked" ? "Picked" : o.status[0].toUpperCase() + o.status.slice(1)}</Pill>
                            )}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
                {g.offers.some((o) => o.notes) && (
                  <div className="space-y-1 border-t border-line px-4 py-3 text-sm text-muted">
                    {g.offers.filter((o) => o.notes).map((o) => <p key={o.id}><span className="font-bold text-ink">{g.privateSale ? "Seller" : "Dealer"} note:</span> {o.notes}</p>)}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2 border-t border-line p-4">
                  {matched && g.conversationId ? (
                    <>
                      <Button size="sm" asChild><Link href={`/chat/${g.conversationId}`}><MessageCircle /> Open chat</Link></Button>
                      <Button size="sm" variant="secondary" asChild><Link href={`/journey/${g.interestId}`}><KeyRound /> Next steps</Link></Button>
                      {g.status === "matched" && <Button size="sm" variant="secondary" onClick={() => bought(g)}>I bought it</Button>}
                      {g.status === "purchased" && !g.privateSale && (
                        <span className="flex items-center gap-1 text-sm text-muted">Rate the seller:
                          {[1, 2, 3, 4, 5].map((n) => <button key={n} aria-label={`${n} stars`} onClick={() => review(g, n)} className="tap grid place-items-center cursor-pointer"><Star className="size-5 text-deal-fair" /></button>)}
                        </span>
                      )}
                    </>
                  ) : (
                    <DraftTray interestId={g.interestId} intents={["negotiate", "trade_in", "question"]} onSent={() => router.refresh()} />
                  )}
                </div>
              </Card>
            );
          })}
          <p className="text-xs text-subtle">Offers are out-the-door totals as quoted by the seller, including tax, title and fees. {assumptions}</p>
        </section>
      )}
      {countering && (
        <CounterSheet offerId={countering.offer.id} offerOtd={countering.offer.otd_total} title={countering.title}
          open={Boolean(countering)} onOpenChange={(o) => !o && setCountering(null)} />
      )}

      {waiting.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">Waiting on dealers</h2>
          <ul className="space-y-3">
            {waiting.map((g) => (
              <li key={g.interestId}>
                <Card className="p-4">
                  <div className="flex items-center gap-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {g.listing.photo && <img src={g.listing.photo} alt="" className="h-14 w-20 shrink-0 rounded-xl object-cover" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">{g.listing.title}</p>
                      <p className="text-sm text-muted">
                        {g.dealer?.name ?? "Private seller"} ·{" "}
                        {g.status === "expired" ? "no reply yet" : g.slaExpiresAt ? `usually replies ${g.dealer?.responseMinutes ? `in ~${Math.max(1, Math.round(g.dealer.responseMinutes / 60))}h` : "within 48h"}` : "we'll reach out to this dealer"}
                      </p>
                    </div>
                    {g.kind === "superlike" && <Pill tone="drive">Test drive</Pill>}
                  </div>
                  {g.notes.length > 0 && <p className={cn("mt-3 rounded-2xl bg-navy-850 px-3 py-2 text-xs text-muted")}>You sent: “{g.notes[g.notes.length - 1].body.slice(0, 140)}{g.notes[g.notes.length - 1].body.length > 140 ? "…" : ""}”</p>}
                  {(g.privateSale || (g.dealer && g.dealer.leadChannel !== "none")) && (
                    <div className="mt-3"><DraftTray interestId={g.interestId} intents={["request_otd", "test_drive"]} onSent={() => router.refresh()} /></div>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function CounterStatus({ counters }: { counters: CounterRow[] }) {
  const last = [...counters].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (!last) return null;
  const text = { open: "waiting for a reply", declined: "declined", accepted: "accepted", superseded: "answered with a new offer" }[last.status] ?? last.status;
  return <span className="text-xs text-muted">You countered {usd(last.amount_otd)}: {text}</span>;
}

/** Email offers often quote only the total; don't show "$0" for lines they didn't itemize. */
function itemized(o: OfferRow, value: number): string {
  return o.source === "email" && value === 0 ? "Not itemized" : usd(value);
}

function Row({ label, values, strong, dim }: { label: string; values: string[]; strong?: boolean; dim?: boolean[] }) {
  return (
    <tr>
      <td className="px-4 py-2.5 text-subtle">{label}</td>
      {values.map((v, i) => (
        <td key={i} className={cn("px-4 py-2.5", strong && "text-lg font-bold", dim?.[i] && "text-subtle line-through")}>{v}</td>
      ))}
    </tr>
  );
}
