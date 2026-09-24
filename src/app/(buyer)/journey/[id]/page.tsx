import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarPlus, FileText, Home, MessageCircle, ShieldCheck } from "lucide-react";
import { BoughtButtons, CheckItem, InspectionBooker, InsuranceCard, PrequalCard, VaultCard, type ShopOption } from "@/components/journey/journey-cards";
import { Button } from "@/components/ui/button";
import { Card, Pill, SectionTitle } from "@/components/ui/primitives";
import { usd } from "@/lib/format";
import { budgetFromPrefs } from "@/lib/money";
import { loadConfig, loadPrefs } from "@/lib/server/data";
import { requireOnboarded } from "@/lib/server/session";
import { createClient } from "@/lib/supabase/server";
import type { TradeIn } from "@/lib/types";

export const metadata: Metadata = { title: "Next steps" };

function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

export default async function JourneyPage({ params }: PageProps<"/journey/[id]">) {
  const { id } = await params;
  const profile = await requireOnboarded(`/journey/${id}`);
  const supabase = await createClient();
  const { data: interest } = await supabase.from("interests")
    .select("id, user_id, status, kind, journey, seller_user_id, test_drive_windows, listing:listings(id, year, make, model, trim_level, price, lat, lng, condition), dealership:dealerships(name, address, city, zip, at_home_test_drive, home_delivery), offers(id, status, otd_total, vehicle_price, apr, term_months), conversations(id)")
    .eq("id", id).maybeSingle();
  if (!interest || interest.user_id !== profile.id) notFound();

  const l = interest.listing as unknown as { id: string; year: number; make: string; model: string; trim_level: string | null; price: number; lat: number; lng: number; condition: string };
  const d = interest.dealership as unknown as { name: string; address: string | null; city: string | null; zip: string | null; at_home_test_drive: boolean; home_delivery: boolean } | null;
  const offers = (interest.offers ?? []) as unknown as { id: string; status: string; otd_total: number; vehicle_price: number; apr: number | null; term_months: number | null }[];
  const picked = offers.find((o) => o.status === "picked") ?? null;
  const conversationId = (Array.isArray(interest.conversations) ? interest.conversations[0] : interest.conversations as { id: string } | null)?.id ?? null;
  const privateSale = Boolean(interest.seller_user_id);
  const journey = (interest.journey ?? {}) as Record<string, string>;
  const title = `${l.year} ${l.make} ${l.model}${l.trim_level ? ` ${l.trim_level}` : ""}`;

  const [config, prefs, { data: messages }, { data: shops }, { data: inspections }, { data: prequal }, { data: quote }, { data: docs }, { data: trade }] = await Promise.all([
    loadConfig(supabase),
    loadPrefs(supabase, profile.id),
    conversationId
      ? supabase.from("messages").select("kind, meta, created_at").eq("conversation_id", conversationId).in("kind", ["text", "test_drive_proposal"]).order("created_at", { ascending: false }).limit(200)
      : Promise.resolve({ data: [] }),
    privateSale ? supabase.from("inspection_shops").select("id, name, address, city, lat, lng, price_usd, rating, mobile, is_demo") : Promise.resolve({ data: [] }),
    supabase.from("inspection_requests").select("status, windows, shop:inspection_shops(name)").eq("interest_id", id).order("created_at", { ascending: false }).limit(1),
    supabase.from("finance_prequals").select("status, max_amount, apr, term_months, created_at").eq("user_id", profile.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("insurance_quotes").select("carrier, monthly_premium, coverage").eq("user_id", profile.id).eq("listing_id", l.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("vault_documents").select("id, kind, file_name, storage_path, created_at").eq("user_id", profile.id).order("created_at", { ascending: false }),
    supabase.from("trade_estimates").select("low, high, year, make, model, created_at").eq("user_id", profile.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  // Test-drive times: a confirmed window from chat, else proposals, else the super-like windows.
  const confirmed = (messages ?? []).map((m) => (m.meta as { confirmed_window?: { day: string; time: string } })?.confirmed_window).find(Boolean) ?? null;
  const proposed = (messages ?? []).filter((m) => m.kind === "test_drive_proposal").map((m) => (m.meta as { windows?: { day: string; time: string }[] })?.windows ?? [])[0]
    ?? (interest.test_drive_windows as { day: string; time: string }[] | null) ?? [];
  const windows = confirmed ? [confirmed] : proposed;

  const budget = budgetFromPrefs(prefs, config.finance);
  const financing = budget.mode !== "cash" && prefs.financing_status?.value !== "cash";
  const tradeIn = (prefs.trade_in?.value as TradeIn | undefined)?.has ? (prefs.trade_in!.value as TradeIn) : null;
  const needed = ["license", "insurance", ...(financing ? ["income"] : []), ...(tradeIn ? ["trade_title", ...(tradeIn.payoff ? ["payoff"] : [])] : [])];
  const shopOptions: ShopOption[] = ((shops ?? []) as { id: string; name: string; address: string | null; city: string | null; lat: number; lng: number; price_usd: number | null; rating: number | null; mobile: boolean; is_demo: boolean }[])
    .map((s) => ({ id: s.id, name: s.name, address: s.address, city: s.city, price: s.price_usd === null ? null : Number(s.price_usd), rating: s.rating, mobile: s.mobile, demo: s.is_demo, distance: milesBetween(l, s) }))
    .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
  const insp = inspections?.[0];
  const amount = Math.max(1000, Number(picked?.otd_total ?? l.price) - budget.down);
  const matched = interest.status === "matched" || interest.status === "purchased";

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 pt-safe pb-10 lg:px-8">
      <header className="flex items-center gap-2 pt-4">
        <Link href="/offers" aria-label="Back" className="tap grid place-items-center rounded-full text-muted hover:text-ink"><ArrowLeft className="size-5" /></Link>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight">From match to keys</h1>
          <p className="truncate text-sm text-muted">{title} · {d?.name ?? "Private seller"}{picked ? ` · ${usd(Number(picked.otd_total))} out the door` : ""}</p>
        </div>
      </header>
      {!matched && <p className="rounded-2xl bg-navy-850 px-4 py-3 text-sm text-muted">Pick an offer first; these steps unlock once you and the seller match. You can still get ready below.</p>}
      {conversationId && <Button variant="secondary" asChild><Link href={`/chat/${conversationId}`}><MessageCircle /> Chat with {d?.name ?? "the seller"}</Link></Button>}

      <Card className="space-y-3 p-5">
        <SectionTitle>1 · Test drive</SectionTitle>
        {windows.length ? (
          <ul className="space-y-2">
            {windows.map((w) => (
              <li key={w.day + w.time} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-bold">{w.day}, {w.time}</span>{confirmed && <Pill tone="good">Confirmed</Pill>}
                <Button size="sm" variant="secondary" asChild>
                  <a href={`/api/ics?interest=${id}&day=${encodeURIComponent(w.day)}&time=${encodeURIComponent(w.time)}`}><CalendarPlus /> Add to calendar</a>
                </Button>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted">Propose times in chat with the calendar button; confirmed times show up here.</p>}
        {d?.at_home_test_drive && <p className="flex items-center gap-2 text-sm text-drive"><Home className="size-4" /> {d.name} offers at-home test drives. Ask in chat.</p>}
        <CheckItem interestId={id} itemKey="test_drive" done={Boolean(journey.test_drive)}>Test drive done: highway speed, braking, every button and the A/C</CheckItem>
      </Card>

      <Card className="space-y-3 p-5">
        <SectionTitle>2 · Inspection</SectionTitle>
        {privateSale ? (
          <>
            <p className="text-sm text-muted">A pre-purchase inspection (about an hour) catches problems a test drive won&apos;t. Pick a shop near the car:</p>
            <InspectionBooker interestId={id} shops={shopOptions}
              existing={insp ? { shop: (insp.shop as unknown as { name: string } | null)?.name ?? "Shop", status: insp.status, windows: insp.windows as { day: string; time: string }[] } : null} />
          </>
        ) : (
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            <li>Ask for the reconditioning report and any open recalls (the Car Brief lists NHTSA recalls).</li>
            <li>An independent inspection is still worth it on a used car. Ask whether the dealer allows one.</li>
          </ul>
        )}
        <CheckItem interestId={id} itemKey="inspection" done={Boolean(journey.inspection)}>Inspection done (or I&apos;m comfortable without one)</CheckItem>
      </Card>

      {financing && (
        <Card className="space-y-3 p-5">
          <SectionTitle>3 · Financing</SectionTitle>
          {picked?.apr ? <p className="text-sm">The seller&apos;s offer includes {picked.apr}% APR for {picked.term_months} months. Compare it with a pre-qualification:</p> : <p className="text-sm text-muted">Walking in pre-qualified gives you a rate to beat.</p>}
          <PrequalCard amount={amount} creditTier={budget.credit} latest={prequal ? { ...prequal, max_amount: prequal.max_amount === null ? null : Number(prequal.max_amount), apr: prequal.apr === null ? null : Number(prequal.apr) } : null} />
          <CheckItem interestId={id} itemKey="financing" done={Boolean(journey.financing)}>Financing lined up</CheckItem>
        </Card>
      )}

      <Card className="space-y-3 p-5">
        <SectionTitle>{financing ? "4" : "3"} · Insurance</SectionTitle>
        <p className="text-sm text-muted">You need proof of insurance before you drive it home.</p>
        <InsuranceCard listingId={l.id} latest={quote ? { carrier: quote.carrier, monthly_premium: Number(quote.monthly_premium), coverage: quote.coverage as Record<string, string> } : null} />
        <CheckItem interestId={id} itemKey="insurance" done={Boolean(journey.insurance)}>Insured from the day of purchase</CheckItem>
      </Card>

      {tradeIn && (
        <Card className="space-y-3 p-5">
          <SectionTitle>Trade-in</SectionTitle>
          <p className="text-sm">{tradeIn.description ?? "Your trade"}{tradeIn.value ? ` · you estimated ${usd(tradeIn.value)}` : ""}{tradeIn.payoff ? ` · owes ${usd(tradeIn.payoff)}` : ""}</p>
          {trade && <p className="text-sm text-muted">Latest estimate: {usd(Number(trade.low))} to {usd(Number(trade.high))} for your {trade.year} {trade.make} {trade.model}.</p>}
          <Button size="sm" variant="secondary" asChild><Link href="/trade">{trade ? "Update estimate" : "Estimate my trade-in"}</Link></Button>
          {privateSale && <p className="text-xs text-subtle">Private sellers don&apos;t take trades. Sell yours separately (you can list it on CarSwipe) or trade it at a dealer.</p>}
        </Card>
      )}

      <Card className="space-y-3 p-5">
        <SectionTitle>Documents</SectionTitle>
        <ul className="grid gap-1 text-sm sm:grid-cols-2">
          {needed.map((k) => <li key={k} className="flex items-center gap-2"><FileText className="size-4 text-muted" /> {{ license: "Driver's license", insurance: "Insurance card", income: "Proof of income and residence", trade_title: "Trade-in title (or registration)", payoff: "Trade-in payoff letter" }[k]}</li>)}
          <li className="flex items-center gap-2"><FileText className="size-4 text-muted" /> {privateSale ? "Payment: cashier's check or bank transfer" : "Down payment"}</li>
        </ul>
        <VaultCard userId={profile.id} interestId={id} conversationId={matched ? conversationId : null} needed={needed}
          docs={(docs ?? []) as { id: string; kind: string; file_name: string; storage_path: string; created_at: string }[]} />
      </Card>

      <Card className="space-y-3 p-5">
        <SectionTitle>Title and registration (Tennessee)</SectionTitle>
        {privateSale ? (
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
            <li>At the sale, the seller signs the title over to you with the odometer reading. Check for a lien; if there is one, get the lien release.</li>
            <li>Both of you sign a bill of sale and keep a copy.</li>
            <li>Insure the car before driving it home.</li>
            <li>Take the title, bill of sale, your license and proof of residence to your county clerk. You pay sales tax there, plus title and registration fees.</li>
            <li>[VERIFY with the TN Department of Revenue: deadline to title, whether your county needs extra forms or notarization, and plate transfer rules.]</li>
          </ol>
        ) : (
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
            <li>The dealer collects sales tax and files the title and registration for you; you leave with a temporary tag.</li>
            <li>Your plates and registration come by mail or from your county clerk. If you&apos;re transferring plates from a trade, tell the dealer.</li>
            <li>[VERIFY with the TN Department of Revenue: timelines and county-specific steps.]</li>
          </ol>
        )}
        <CheckItem interestId={id} itemKey="title" done={Boolean(journey.title)}>Title and registration handled</CheckItem>
      </Card>

      {privateSale && (
        <Card className="space-y-3 p-5">
          <SectionTitle>Private-sale paperwork and safety</SectionTitle>
          <p className="flex items-start gap-2 text-sm text-muted"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-deal-good" /> Meet in daylight at a public place or your bank. Check the seller&apos;s ID matches the title and the VIN on the car matches both. Pay by cashier&apos;s check or bank transfer at the bank, never gift cards, wires or crypto.</p>
          <Button variant="secondary" asChild><Link href={`/journey/${id}/bill-of-sale`}><FileText /> Bill of sale</Link></Button>
        </Card>
      )}

      <Card className="space-y-3 p-5">
        <SectionTitle>Done</SectionTitle>
        <p className="text-sm text-muted">One tap tells us you bought it{privateSale ? "" : " and credits the dealer"}.</p>
        {matched && <BoughtButtons interestId={id} price={picked ? Number(picked.otd_total) : null} status={interest.status} privateSale={privateSale} />}
      </Card>
    </main>
  );
}
