import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Card, Input, Pill } from "@/components/ui/primitives";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClaimLink, updateDealer } from "../actions";

export const metadata: Metadata = { title: "Dealers" };
export const dynamic = "force-dynamic";

export default async function AdminDealers() {
  const admin = createAdminClient();
  const [{ data: dealers }, { data: priv }, { data: members }, { data: claims }] = await Promise.all([
    admin.from("dealerships").select("id, name, city, lead_channel, verified_at, claimed_at, rating, review_count").order("name"),
    admin.from("dealership_private").select("dealership_id, lead_email"),
    admin.from("dealership_members").select("dealership_id"),
    admin.from("admin_audit_log").select("target, details, created_at").eq("action", "dealer.claim_link").order("created_at", { ascending: false }).limit(50),
  ]);
  const email = new Map((priv ?? []).map((p) => [p.dealership_id, p.lead_email]));
  const memberCount = (id: string) => (members ?? []).filter((m) => m.dealership_id === id).length;
  const lastClaim = (id: string) => (claims ?? []).find((c) => c.target === id)?.details as { url?: string } | undefined;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Dealers</h1>
      <p className="mb-6 text-sm text-muted">Verification, lead-email curation and claim links. Leads route by channel: inbox (on platform), email (ADF), none (saved for outreach).</p>
      <div className="space-y-3">
        {(dealers ?? []).map((d) => (
          <Card key={d.id} className="p-4">
            <form action={updateDealer} className="grid items-center gap-3 lg:grid-cols-[1.4fr_1fr_1.4fr_auto_auto]">
              <input type="hidden" name="id" value={d.id} />
              <div>
                <p className="font-bold">{d.name}</p>
                <p className="text-xs text-muted">{d.city} · {memberCount(d.id)} member{memberCount(d.id) === 1 ? "" : "s"} {d.claimed_at && <Pill tone="good" className="ml-1">Claimed</Pill>}</p>
              </div>
              <select name="lead_channel" defaultValue={d.lead_channel} className="h-11 rounded-2xl border border-line bg-navy-850 px-3 text-sm">
                <option value="inbox">Inbox</option><option value="email">ADF email</option><option value="none">None (outreach)</option>
              </select>
              <Input name="lead_email" type="email" placeholder="leads@dealer.com" defaultValue={email.get(d.id) ?? ""} />
              <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="verified" defaultChecked={Boolean(d.verified_at)} className="size-5 accent-[var(--color-accent)]" /> Verified</label>
              <Button size="sm" type="submit">Save</Button>
            </form>
            <form action={createClaimLink} className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <input type="hidden" name="id" value={d.id} />
              <button className="font-bold text-accent-soft hover:underline cursor-pointer" type="submit">Create claim link</button>
              {lastClaim(d.id)?.url && <code className="break-all text-subtle">{lastClaim(d.id)!.url}</code>}
            </form>
          </Card>
        ))}
      </div>
    </div>
  );
}
