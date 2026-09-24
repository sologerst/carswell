import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, Mail, MessageCircle, Phone, Sparkles } from "lucide-react";
import { SendOfferForm } from "@/components/dealer/send-offer-form";
import { Button } from "@/components/ui/button";
import { Card, Pill, SectionTitle } from "@/components/ui/primitives";
import { templateLeadSummary } from "@/lib/ai/summaries";
import { relativeTime, usd } from "@/lib/format";
import { loadConfig } from "@/lib/server/data";
import { describeBudget, describeFinancing, describeTrade, loadLeads, TIMELINE_TEXT } from "@/lib/server/dealer";
import { requireDealer } from "@/lib/server/session";
import { createClient } from "@/lib/supabase/server";
import type { TradeIn } from "@/lib/types";

export const metadata: Metadata = { title: "Lead" };

export default async function LeadPage({ params }: PageProps<"/dealer/leads/[id]">) {
  const { id } = await params;
  const { membership } = await requireDealer();
  const supabase = await createClient();
  const config = await loadConfig(supabase);
  const leads = await loadLeads(supabase, membership.dealership_id, config);
  const lead = leads.find((l) => l.interest_id === id);
  if (!lead) notFound();
  const [{ data: offers }, { data: counters }] = await Promise.all([
    supabase.from("offers").select("*").eq("interest_id", id).order("created_at", { ascending: false }),
    supabase.from("counteroffers").select("id, amount_otd, body, status, created_at").eq("interest_id", id).order("created_at", { ascending: false }),
  ]);
  const open = (counters ?? []).find((c) => c.status === "open");
  const p = lead.dossier.preferences ?? {};
  const matched = lead.status === "matched" || lead.status === "purchased";
  const canOffer = ["sent", "offered", "expired"].includes(lead.status);
  const { firstReply } = templateLeadSummary(lead.dossier, { title: lead.listing_title, price: lead.listing_price });
  const docFee = Number(membership.dealership.doc_fee ?? config.finance.default_doc_fee);

  return (
    <div className="space-y-6">
      <Link href="/dealer" className="tap -ml-2 inline-flex items-center gap-1 rounded-full px-2 text-sm font-bold text-muted hover:text-ink"><ArrowLeft className="size-4" /> Leads</Link>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-6">
          <Card className="flex gap-4 p-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {lead.listing_photo && <img src={lead.listing_photo} alt="" className="h-28 w-40 shrink-0 rounded-2xl object-cover" />}
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold">{lead.dossier.first_name ?? "Buyer"}</h1>
                {lead.kind === "superlike" && <Pill tone="drive"><CalendarClock className="size-3" /> Test-drive request</Pill>}
                <Pill tone={matched ? "good" : "default"}>{lead.status}</Pill>
              </div>
              <p className="mt-1">{lead.listing_title} · {usd(lead.listing_price)} · VIN {lead.listing_vin}</p>
              <p className="text-sm text-muted">Liked {relativeTime(lead.created_at)}{lead.distance_mi !== null ? ` · lives ~${Math.round(lead.distance_mi)} mi away` : ""}</p>
            </div>
          </Card>

          <Card className="p-5">
            <SectionTitle>Buyer dossier</SectionTitle>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Item label="Budget" value={describeBudget(p)} extra={lead.maxPrice ? `Fits cars up to ~${usd(lead.maxPrice)} (est.)` : undefined} />
              <Item label="Financing" value={describeFinancing(p)} />
              <Item label="Trade-in" value={describeTrade(p)} />
              <Item label="Timeline" value={TIMELINE_TEXT[String(p.timeline)] ?? "Not shared"} />
              <Item label="Looking for" value={Array.isArray(p.body_styles) ? (p.body_styles as string[]).map((b) => b.replace(/_/g, " ")).join(", ") : "Open"} />
              <Item label="Taste" value={lead.dossier.top_tastes?.length ? lead.dossier.top_tastes.map((t) => t.split(":")[1].replace(/_/g, " ")).join(", ") : "Still learning"} />
            </dl>
            {lead.test_drive_windows?.length ? (
              <p className="mt-4 rounded-2xl bg-drive/10 px-4 py-3 text-sm"><span className="font-bold text-drive">Test drive windows:</span> {lead.test_drive_windows.map((w) => `${w.day} ${w.time}`).join(" · ")}</p>
            ) : null}
          </Card>

          <Card className="p-5">
            <p className="mb-2 flex items-center gap-2 text-sm font-bold text-accent-soft"><Sparkles className="size-4" /> AI lead summary</p>
            <p>{lead.lead_summary ?? "Summary is being prepared."}</p>
            <p className="mt-3 text-sm text-muted"><span className="font-bold text-ink">Suggested first reply:</span> {firstReply}</p>
          </Card>

          {lead.buyer_notes.length > 0 && (
            <Card className="p-5">
              <SectionTitle>Notes from the buyer</SectionTitle>
              <ul className="space-y-3">{lead.buyer_notes.map((n) => <li key={n.at} className="rounded-2xl bg-navy-850 px-4 py-3 text-sm"><p className="whitespace-pre-wrap">{n.body}</p><p className="mt-1 text-xs text-subtle">{relativeTime(n.at)}</p></li>)}</ul>
            </Card>
          )}

          {matched && (
            <Card className="p-5">
              <SectionTitle>Contact (unlocked: the buyer picked your offer)</SectionTitle>
              <div className="flex flex-wrap gap-3 text-sm">
                {lead.buyer_email && <a className="inline-flex items-center gap-2 font-bold" href={`mailto:${lead.buyer_email}`}><Mail className="size-4" /> {lead.buyer_email}</a>}
                {lead.buyer_phone ? <a className="inline-flex items-center gap-2 font-bold" href={`tel:${lead.buyer_phone}`}><Phone className="size-4" /> {lead.buyer_phone}</a> : <span className="text-muted">Phone not shared yet</span>}
              </div>
              {lead.conversation_id && <Button className="mt-4" asChild><Link href={`/dealer/chat/${lead.conversation_id}`}><MessageCircle /> Open chat</Link></Button>}
            </Card>
          )}
        </div>

        <div className="space-y-4">
          {canOffer && (
            <SendOfferForm
              interestId={lead.interest_id}
              listingPrice={lead.listing_price}
              docFee={docFee}
              tax={config.tax_tn}
              trade={(p.trade_in as TradeIn | undefined) ?? null}
              buyerName={lead.dossier.first_name ?? "the buyer"}
              title={lead.listing_title}
              counter={open ? { id: open.id, amount_otd: Number(open.amount_otd), body: open.body, created_at: open.created_at } : null}
            />
          )}
          {(offers ?? []).length > 0 && (
            <Card className="p-5">
              <SectionTitle>Your offers</SectionTitle>
              <ul className="space-y-2 text-sm">
                {(offers ?? []).map((o) => (
                  <li key={o.id} className="flex items-center justify-between rounded-2xl bg-navy-850 px-4 py-3">
                    <span><span className="font-bold">{usd(Number(o.otd_total))}</span> out the door</span>
                    <Pill tone={o.status === "picked" ? "good" : o.status === "active" ? "accent" : "default"}>{o.status}</Pill>
                  </li>
                ))}
              </ul>
              {(counters ?? []).length > 0 && (
                <>
                  <SectionTitle className="mt-4">Counteroffers</SectionTitle>
                  <ul className="space-y-2 text-sm">
                    {(counters ?? []).map((c) => (
                      <li key={c.id} className="flex items-center justify-between rounded-2xl bg-navy-850 px-4 py-3">
                        <span><span className="font-bold">{usd(Number(c.amount_otd))}</span> · {relativeTime(c.created_at)}</span>
                        <Pill tone={c.status === "open" ? "drive" : c.status === "accepted" ? "good" : "default"}>{c.status}</Pill>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Item({ label, value, extra }: { label: string; value: string; extra?: string }) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-wider text-subtle">{label}</dt>
      <dd className="mt-0.5 font-bold">{value}</dd>
      {extra && <dd className="text-xs text-muted">{extra}</dd>}
    </div>
  );
}
