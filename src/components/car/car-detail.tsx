"use client";

import { CalendarClock, ExternalLink, Heart, ShieldAlert, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { BriefPanel } from "@/components/car/brief-panel";
import { CarPhoto } from "@/components/car/car-photo";
import { MiniMap } from "@/components/car/mini-map";
import { Button } from "@/components/ui/button";
import { DealBadge, Pill, SectionTitle } from "@/components/ui/primitives";
import { FEATURES, FEATURE_GROUP_LABELS, featureLabel, type FeatureGroup } from "@/lib/criteria/features";
import { marketDeltaText } from "@/lib/deal";
import { milesLong, usd } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { BODY_LABEL, CONDITION_LABEL, DRIVE_LABEL, FUEL_LABEL, listingTitle, type DeckCard } from "@/lib/types";

export interface DetailCard extends DeckCard {
  listing: DeckCard["listing"] & { lat?: number; lng?: number; description?: string | null; is_active?: boolean };
}

interface Recall { campaign: string; component: string; summary: string; remedy: string; date: string }

export function CarDetail({
  card, origin, onLike, onTestDrive, onMoreLikeThis, statusSlot,
}: {
  card: DetailCard;
  origin?: { lat: number; lng: number; label: string } | null;
  onLike?: () => void;
  onTestDrive?: () => void;
  onMoreLikeThis?: () => void;
  statusSlot?: React.ReactNode;
}) {
  const l = card.listing;
  const [priceHistory, setPriceHistory] = useState<{ old_price: number; new_price: number; changed_at: string }[]>([]);
  const [recalls, setRecalls] = useState<Recall[] | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.from("listing_price_changes").select("old_price, new_price, changed_at").eq("listing_id", l.id).order("changed_at", { ascending: false }).limit(5)
      .then(({ data }) => setPriceHistory(data ?? []));
    fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ events: [{ listing_id: l.id, kind: "detail_open" }] }) }).catch(() => {});
  }, [l.id]);

  async function checkRecalls() {
    setChecking(true);
    try {
      const r = await fetch(`/api/vin/${l.vin}`);
      const body = (await r.json()) as { recalls?: Recall[] };
      setRecalls(body.recalls ?? []);
    } catch {
      setRecalls([]);
    } finally {
      setChecking(false);
    }
  }

  const delta = marketDeltaText(l.price, l.expected_price);
  const groups = (Object.keys(FEATURE_GROUP_LABELS) as FeatureGroup[])
    .map((g) => ({ g, items: FEATURES.filter((f) => f.group === g && l.features.includes(f.key)) }))
    .filter((x) => x.items.length);
  const specs: [string, string | null][] = [
    ["Condition", CONDITION_LABEL[l.condition]],
    ["Mileage", milesLong(l.miles)],
    ["Body", BODY_LABEL[l.body_style]],
    ["Drivetrain", l.drivetrain ? DRIVE_LABEL[l.drivetrain] : null],
    ["Engine", l.engine],
    ["Fuel", FUEL_LABEL[l.fuel_type]],
    [l.fuel_type === "electric" ? "Range" : "MPG", l.fuel_type === "electric" ? (l.ev_range_mi ? `${l.ev_range_mi} mi` : "Range not listed") : l.mpg_city ? `${l.mpg_city} city / ${l.mpg_hwy} hwy` : null],
    ["Seats", l.seats ? String(l.seats) : null],
    ["Towing", l.towing_lbs ? `${l.towing_lbs.toLocaleString("en-US")} lb` : null],
    ["Exterior", l.exterior_color],
    ["Interior", [l.interior_color, l.interior_material?.replace("_", " ")].filter(Boolean).join(", ") || null],
    ["VIN", l.vin],
  ];
  const history: [string, string, "good" | "bad" | "unknown"][] = [
    ["Title", l.title_status ? (l.title_status === "clean" ? "Clean" : l.title_status[0].toUpperCase() + l.title_status.slice(1)) : "Title not reported", l.title_status === null ? "unknown" : l.title_status === "clean" ? "good" : "bad"],
    ["Accidents", l.accident_count === null ? "History not reported" : l.accident_count === 0 ? "None reported" : `${l.accident_count} reported`, l.accident_count === null ? "unknown" : l.accident_count === 0 ? "good" : "bad"],
    ["Owners", l.owner_count === null ? "Not reported" : l.owner_count === 0 ? "New" : String(l.owner_count), l.owner_count === null ? "unknown" : l.owner_count <= 1 ? "good" : "unknown"],
    ["Use", l.personal_use === null ? "Not reported" : l.personal_use ? "Personal" : "Rental or fleet", l.personal_use === null ? "unknown" : l.personal_use ? "good" : "bad"],
  ];

  return (
    <div className="space-y-6">
      <CarPhoto photos={l.photos} alt={listingTitle(l, true)} className="aspect-[4/3] w-full rounded-3xl" priority />

      <div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{listingTitle(l, true)}</h2>
            <p className="mt-1 text-muted">{l.seller_type === "private" ? (l.source === "private" ? "Private seller · phone verified" : "Private seller") : l.dealer_name}{l.distance_mi ? ` · ${Math.round(l.distance_mi)} mi away` : ""}</p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <DealBadge rating={l.deal_rating} />
            {l.is_promoted && <Pill>Promoted</Pill>}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Stat label="Price" value={usd(l.price)} />
          <Stat label="Est. monthly" value={`${usd(card.monthlyEstimate)}`} />
          <Stat label={card.afterTrade ? "Est. OTD after trade" : "Est. out the door"} value={usd(card.otdEstimate)} />
        </div>
        <p className="mt-2 text-xs text-subtle">
          {l.seller_type === "private"
            ? <>Estimates include TN sales tax (paid at the county clerk in a private sale) and title{card.afterTrade ? ", minus your trade-in equity" : ""}, using your budget settings. Not a credit offer.</>
            : <>Estimates include TN sales tax, title and the dealer&apos;s doc fee{card.afterTrade ? ", minus your trade-in equity" : ""}, using your budget settings. Not a credit offer.</>}
          {delta ? ` Priced ${delta}.` : ""}
        </p>
        {l.is_active === false && <p className="mt-3 rounded-2xl bg-deal-bad/15 px-4 py-2 text-sm font-bold text-deal-bad">Sold</p>}
        {statusSlot}
      </div>

      {(onLike || onTestDrive || onMoreLikeThis) && (
        <div className="flex flex-wrap gap-2">
          {onLike && <Button onClick={onLike}><Heart /> Like</Button>}
          {onTestDrive && <Button variant="secondary" onClick={onTestDrive}><CalendarClock /> Test drive</Button>}
          {onMoreLikeThis && <Button variant="outline" onClick={onMoreLikeThis}><Sparkles /> More like this</Button>}
        </div>
      )}

      <BriefPanel key={l.id} listingId={l.id} />

      <section>
        <SectionTitle>Specs</SectionTitle>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          {specs.filter(([, v]) => v).map(([k, v]) => (
            <div key={k} className={k === "VIN" ? "col-span-2" : ""}>
              <dt className="text-subtle">{k}</dt>
              <dd className="font-bold break-all">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <SectionTitle>Features</SectionTitle>
        {!l.features_verified && <p className="mb-3 text-sm text-deal-fair">Listed by the seller; not confirmed by build data.</p>}
        {groups.length === 0 ? <p className="text-sm text-muted">No features listed.</p> : (
          <div className="space-y-3">
            {groups.map(({ g, items }) => (
              <div key={g}>
                <p className="mb-1.5 text-xs font-bold text-muted">{FEATURE_GROUP_LABELS[g]}</p>
                <div className="flex flex-wrap gap-1.5">{items.map((f) => <Pill key={f.key}>{featureLabel(f.key)}</Pill>)}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionTitle>History</SectionTitle>
        <ul className="divide-y divide-line rounded-3xl bg-navy-850">
          {history.map(([k, v, tone]) => (
            <li key={k} className="flex items-center justify-between px-4 py-3 text-sm">
              <span className="text-muted">{k}</span>
              <span className={tone === "good" ? "font-bold text-deal-good" : tone === "bad" ? "font-bold text-deal-bad" : "font-bold text-deal-fair"}>{v}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <SectionTitle>Recalls</SectionTitle>
        {recalls === null ? (
          <Button variant="outline" size="sm" onClick={checkRecalls} disabled={checking}><ShieldAlert /> {checking ? "Checking NHTSA…" : "Check open recalls by VIN"}</Button>
        ) : recalls.length === 0 ? (
          <p className="text-sm text-muted">No recalls found for this model year (NHTSA).</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {recalls.slice(0, 5).map((r) => (
              <li key={r.campaign} className="rounded-2xl bg-navy-850 p-3">
                <p className="font-bold">{r.component}</p>
                <p className="mt-1 text-muted line-clamp-3">{r.summary}</p>
                <p className="mt-1 text-xs text-subtle">Campaign {r.campaign} · ask the dealer to confirm the fix</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {priceHistory.length > 0 && (
        <section>
          <SectionTitle>Price history</SectionTitle>
          <ul className="space-y-1 text-sm">
            {priceHistory.map((p) => (
              <li key={p.changed_at} className="flex justify-between">
                <span className="text-muted">{new Date(p.changed_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                <span className={p.new_price < p.old_price ? "font-bold text-deal-good" : "font-bold"}>
                  {usd(p.old_price)} → {usd(p.new_price)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {origin && l.lat && l.lng && (
        <section>
          <SectionTitle>Approximate location</SectionTitle>
          <MiniMap from={origin} to={{ lat: l.lat, lng: l.lng }} label={origin.label} />
        </section>
      )}

      {l.description && (
        <section>
          <SectionTitle>From the seller</SectionTitle>
          <p className="text-sm text-muted">{l.description}</p>
        </section>
      )}

      {l.source_url && (
        <a href={l.source_url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-sm font-bold text-accent-soft">
          View on source <ExternalLink className="size-4" />
        </a>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-navy-850 px-2 py-3">
      <p className="text-[11px] font-bold uppercase tracking-wider text-subtle">{label}</p>
      <p className="mt-1 font-bold">{value}</p>
    </div>
  );
}
