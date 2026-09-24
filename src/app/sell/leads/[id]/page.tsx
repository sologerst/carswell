import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, FileText, MessageCircle, Phone } from "lucide-react";
import { SendOfferForm } from "@/components/dealer/send-offer-form";
import { Button } from "@/components/ui/button";
import { Card, Pill, SectionTitle } from "@/components/ui/primitives";
import { relativeTime, usd } from "@/lib/format";
import { loadConfig } from "@/lib/server/data";
import { loadSellerLeads, TIMELINE_TEXT } from "@/lib/server/dealer";
import { requireProfile } from "@/lib/server/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Buyer" };

export default async function SellerLeadPage({ params }: PageProps<"/sell/leads/[id]">) {
  const { id } = await params;
  await requireProfile(`/sell/leads/${id}`);
  const supabase = await createClient();
  const [config, leads] = await Promise.all([loadConfig(supabase), loadSellerLeads(supabase)]);
  const lead = leads.find((l) => l.interest_id === id);
  if (!lead) notFound();
  const [{ data: offers }, { data: counters }, { data: inspections }] = await Promise.all([
    supabase.from("offers").select("id, otd_total, vehicle_price, status, created_at").eq("interest_id", id).order("created_at", { ascending: false }),
    supabase.from("counteroffers").select("id, amount_otd, body, status, created_at").eq("interest_id", id).order("created_at", { ascending: false }),
    supabase.from("inspection_requests").select("id, status, windows, shop:inspection_shops(name, address, city)").eq("interest_id", id),
  ]);
  const open = (counters ?? []).find((c) => c.status === "open");
  const p = lead.dossier.preferences ?? {};
  const matched = lead.status === "matched" || lead.status === "purchased";
  const canOffer = ["sent", "offered", "expired"].includes(lead.status);

  return (
    <div className="space-y-6">
      <Link href="/sell/leads" className="tap -ml-2 inline-flex items-center gap-1 rounded-full px-2 text-sm font-bold text-muted hover:text-ink"><ArrowLeft className="size-4" /> Buyers</Link>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-6">
          <Card className="flex gap-4 p-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {lead.listing_photo && <img src={lead.listing_photo} alt="" className="h-24 w-32 shrink-0 rounded-2xl object-cover" />}
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold">{lead.dossier.first_name ?? "Buyer"}</h1>
                {lead.kind === "superlike" && <Pill tone="drive"><CalendarClock className="size-3" /> Wants to see it</Pill>}
                <Pill tone={matched ? "good" : "default"}>{lead.status}</Pill>
              </div>
              <p className="mt-1">{lead.listing_title} · {usd(lead.listing_price)}</p>
              <p className="text-sm text-muted">Liked {relativeTime(lead.created_at)}{lead.distance_mi !== null ? ` · ~${Math.round(lead.distance_mi)} mi away` : ""}</p>
            </div>
          </Card>
          <Card className="p-5">
            <SectionTitle>About this buyer</SectionTitle>
            <dl className="grid gap-4 sm:grid-cols-2">
              <div><dt className="text-xs font-bold uppercase tracking-wider text-subtle">Paying with</dt><dd className="font-bold">{p.financing_status === "cash" || p.budget_mode === "cash" ? "Cash" : p.financing_status === "preapproved" ? "Pre-approved loan" : "Financing"}</dd></div>
              <div><dt className="text-xs font-bold uppercase tracking-wider text-subtle">Timeline</dt><dd className="font-bold">{TIMELINE_TEXT[String(p.timeline)] ?? "Not shared"}</dd></div>
            </dl>
            {lead.test_drive_windows?.length ? <p className="mt-4 rounded-2xl bg-drive/10 px-4 py-3 text-sm"><span className="font-bold text-drive">Could see it:</span> {lead.test_drive_windows.map((w) => `${w.day} ${w.time}`).join(" · ")}</p> : null}
            {lead.lead_summary && <p className="mt-4 text-sm text-muted">{lead.lead_summary}</p>}
          </Card>
          {lead.buyer_notes.length > 0 && (
            <Card className="p-5">
              <SectionTitle>Notes from the buyer</SectionTitle>
              <ul className="space-y-3">{lead.buyer_notes.map((n) => <li key={n.at} className="rounded-2xl bg-navy-850 px-4 py-3 text-sm"><p className="whitespace-pre-wrap">{n.body}</p><p className="mt-1 text-xs text-subtle">{relativeTime(n.at)}</p></li>)}</ul>
            </Card>
          )}
          {(inspections ?? []).length > 0 && (
            <Card className="p-5">
              <SectionTitle>Inspection requested</SectionTitle>
              {(inspections ?? []).map((i) => {
                const shop = i.shop as unknown as { name: string; address: string | null; city: string | null } | null;
                return <p key={i.id} className="text-sm">{shop?.name} · {[shop?.address, shop?.city].filter(Boolean).join(", ")} · <span className="text-muted">{i.status}</span></p>;
              })}
              <p className="mt-2 text-xs text-subtle">Buyers who inspect first buy with confidence. Agree on a time in chat.</p>
            </Card>
          )}
          {matched && (
            <Card className="space-y-3 p-5">
              <SectionTitle>Next steps</SectionTitle>
              {lead.buyer_phone ? <a className="inline-flex items-center gap-2 font-bold" href={`tel:${lead.buyer_phone}`}><Phone className="size-4" /> {lead.buyer_phone}</a> : <p className="text-sm text-muted">The buyer hasn&apos;t shared a phone number. Use chat.</p>}
              <div className="flex flex-wrap gap-2">
                {lead.conversation_id && <Button asChild><Link href={`/sell/chat/${lead.conversation_id}`}><MessageCircle /> Open chat</Link></Button>}
                <Button variant="secondary" asChild><Link href={`/sell/leads/${lead.interest_id}/bill-of-sale`}><FileText /> Bill of sale</Link></Button>
              </div>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
                <li>Meet in daylight at a public place or your bank. Bring the title and your ID.</li>
                <li>Accept a cashier&apos;s check verified at the issuing bank, or complete payment at your bank. Never accept overpayments.</li>
                <li>Sign the title over and remove your plates [VERIFY TN plate rules]. Keep a copy of the bill of sale.</li>
              </ul>
            </Card>
          )}
        </div>
        <div className="space-y-4">
          {canOffer && (
            <SendOfferForm mode="private" interestId={lead.interest_id} listingPrice={lead.listing_price} docFee={0}
              tax={config.tax_tn} trade={null} buyerName={lead.dossier.first_name ?? "the buyer"} title={lead.listing_title}
              counter={open ? { id: open.id, amount_otd: Number(open.amount_otd), body: open.body, created_at: open.created_at } : null} />
          )}
          {(offers ?? []).length > 0 && (
            <Card className="p-5">
              <SectionTitle>Prices you sent</SectionTitle>
              <ul className="space-y-2 text-sm">
                {(offers ?? []).map((o) => (
                  <li key={o.id} className="flex items-center justify-between rounded-2xl bg-navy-850 px-4 py-3">
                    <span><span className="font-bold">{usd(Number(o.vehicle_price))}</span> · {relativeTime(o.created_at)}</span>
                    <Pill tone={o.status === "picked" ? "good" : o.status === "active" ? "accent" : "default"}>{o.status === "picked" ? "accepted" : o.status}</Pill>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
