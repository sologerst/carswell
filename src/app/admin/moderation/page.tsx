import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Card, Empty, Input, Pill, SectionTitle } from "@/components/ui/primitives";
import { relativeTime, usd } from "@/lib/format";
import type { RiskFlag } from "@/lib/safety/listing-risk";
import { createAdminClient } from "@/lib/supabase/admin";
import { moderateListing } from "../actions";

export const metadata: Metadata = { title: "Moderation" };
export const dynamic = "force-dynamic";

const TONE: Record<string, "bad" | "fair" | "default"> = { block: "bad", high: "bad", medium: "fair", low: "default" };

export default async function ModerationQueue() {
  const admin = createAdminClient();
  const [{ data: pending }, { data: recent }] = await Promise.all([
    admin.from("listings")
      .select("id, vin, year, make, model, trim_level, price, expected_price, miles, description, risk_score, moderation, created_at, private_seller_id, listing_photos(url, position)")
      .eq("review_status", "pending").order("created_at").limit(50),
    admin.from("listings")
      .select("id, year, make, model, review_status, risk_score, moderation, updated_at")
      .eq("source", "private").in("review_status", ["rejected", "approved"]).order("updated_at", { ascending: false }).limit(20),
  ]);
  const sellerIds = [...new Set((pending ?? []).map((l) => l.private_seller_id).filter((x): x is string => Boolean(x)))];
  const { data: sellers } = sellerIds.length
    ? await admin.from("profiles").select("id, first_name, email, phone, phone_verified_at, created_at").in("id", sellerIds)
    : { data: [] };
  const seller = new Map((sellers ?? []).map((s) => [s.id, s]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Moderation</h1>
        <p className="text-sm text-muted">Private listings the risk rules sent for review. Known scam patterns (copied photos, a VIN at a dealer, payment-scam text) are blocked automatically and listed under Recent.</p>
      </div>
      {(pending ?? []).length === 0 ? (
        <Card><Empty title="Queue is empty" body="New private listings that need a look will show up here." /></Card>
      ) : (
        <div className="space-y-4">
          {(pending ?? []).map((l) => {
            const flags = ((l.moderation as { flags?: RiskFlag[] } | null)?.flags ?? []);
            const s = l.private_seller_id ? seller.get(l.private_seller_id) : null;
            const photos = [...(l.listing_photos ?? [])].sort((a, b) => a.position - b.position);
            return (
              <Card key={l.id} className="grid gap-4 p-5 lg:grid-cols-[1fr_320px]">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-lg font-bold">{l.year} {l.make} {l.model}{l.trim_level ? ` ${l.trim_level}` : ""}</p>
                    <Pill tone="fair">Risk {Math.round(Number(l.risk_score ?? 0) * 100)}</Pill>
                    <span className="text-xs text-subtle">{relativeTime(l.created_at)}</span>
                  </div>
                  <p className="text-sm text-muted">{usd(Number(l.price))}{l.expected_price ? ` (market ~${usd(Number(l.expected_price))})` : ""} · {l.miles.toLocaleString("en-US")} mi · VIN <code>{l.vin}</code></p>
                  <div className="flex gap-1 overflow-x-auto">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {photos.map((p) => <a key={p.url} href={p.url} target="_blank" rel="noreferrer"><img src={p.url} alt="" className="h-24 w-32 shrink-0 rounded-xl object-cover" /></a>)}
                  </div>
                  <ul className="space-y-1 text-sm">{flags.map((f) => <li key={f.code} className="flex items-start gap-2"><Pill tone={TONE[f.severity] ?? "default"}>{f.code.replace(/_/g, " ")}</Pill><span className="text-muted">{f.detail}</span></li>)}</ul>
                  <details className="text-sm"><summary className="cursor-pointer font-bold">Description</summary><p className="mt-2 whitespace-pre-wrap text-muted">{l.description}</p></details>
                </div>
                <div className="space-y-3">
                  <div className="rounded-2xl bg-navy-850 p-4 text-sm">
                    <SectionTitle className="mb-1">Seller</SectionTitle>
                    <p className="font-bold">{s?.first_name ?? "Unknown"} · {s?.email}</p>
                    <p className="text-muted">{s?.phone_verified_at ? `Phone verified ${s.phone}` : "Phone not verified"} · joined {s ? relativeTime(s.created_at) : "?"}</p>
                  </div>
                  <form action={moderateListing} className="space-y-2">
                    <input type="hidden" name="id" value={l.id} />
                    <Input name="reason" placeholder="Reason (sent to the seller on reject)" />
                    <div className="grid grid-cols-2 gap-2">
                      <Button name="decision" value="approve" type="submit">Approve</Button>
                      <Button name="decision" value="reject" type="submit" variant="danger">Reject</Button>
                    </div>
                  </form>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <Card className="p-5">
        <SectionTitle>Recent decisions</SectionTitle>
        <ul className="divide-y divide-line text-sm">
          {(recent ?? []).map((l) => {
            const m = l.moderation as { decision?: string; by?: string; decided_by?: string; flags?: RiskFlag[] } | null;
            return (
              <li key={l.id} className="flex flex-wrap items-center gap-2 py-2">
                <Pill tone={l.review_status === "approved" ? "good" : "bad"}>{l.review_status}</Pill>
                <span className="font-bold">{l.year} {l.make} {l.model}</span>
                <span className="text-muted">{m?.decided_by ? "by admin" : "automatic"}{m?.flags?.length ? ` · ${m.flags.map((f) => f.code).join(", ")}` : ""}</span>
                <span className="ml-auto text-xs text-subtle">{relativeTime(l.updated_at)}</span>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
