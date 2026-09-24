import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { Button } from "@/components/ui/button";
import { Card, Input, Label, SectionTitle } from "@/components/ui/primitives";
import { requireDealer } from "@/lib/server/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dealer settings" };

const TOGGLES = [
  ["accepts_trade_ins", "Accepts trade-ins"],
  ["no_haggle", "No-haggle pricing"],
  ["home_delivery", "Home delivery"],
  ["at_home_test_drive", "At-home test drives"],
  ["buy_online", "Buy online"],
] as const;

async function save(formData: FormData) {
  "use server";
  const { membership } = await requireDealer();
  const supabase = await createClient();
  const docFee = Number(formData.get("doc_fee"));
  await supabase.from("dealerships").update({
    phone: String(formData.get("phone") ?? "") || null,
    website: String(formData.get("website") ?? "") || null,
    doc_fee: Number.isFinite(docFee) ? docFee : null,
    ...Object.fromEntries(TOGGLES.map(([k]) => [k, formData.get(k) === "on"])),
  }).eq("id", membership.dealership_id);
  const leadEmail = String(formData.get("lead_email") ?? "").trim();
  await supabase.from("dealership_private").update({ lead_email: leadEmail || null }).eq("dealership_id", membership.dealership_id);
  revalidatePath("/dealer/settings");
}

export default async function DealerSettings() {
  const { membership } = await requireDealer();
  const supabase = await createClient();
  const [{ data: d }, { data: priv }] = await Promise.all([
    supabase.from("dealerships").select("*").eq("id", membership.dealership_id).single(),
    supabase.from("dealership_private").select("lead_email").eq("dealership_id", membership.dealership_id).maybeSingle(),
  ]);
  if (!d) return null;
  return (
    <form action={save} className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">{d.name}</h1>
      <Card className="space-y-4 p-5">
        <SectionTitle>Contact and fees</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label htmlFor="phone">Phone</Label><Input id="phone" name="phone" defaultValue={d.phone ?? ""} /></div>
          <div><Label htmlFor="website">Website</Label><Input id="website" name="website" defaultValue={d.website ?? ""} /></div>
          <div><Label htmlFor="doc_fee">Doc fee (pre-fills offers)</Label><Input id="doc_fee" name="doc_fee" inputMode="decimal" defaultValue={d.doc_fee ?? ""} /></div>
          <div><Label htmlFor="lead_email">Lead email (ADF)</Label><Input id="lead_email" name="lead_email" type="email" defaultValue={priv?.lead_email ?? ""} /></div>
        </div>
      </Card>
      <Card className="space-y-3 p-5">
        <SectionTitle>Buying experience</SectionTitle>
        {TOGGLES.map(([k, label]) => (
          <label key={k} className="flex items-center gap-3 text-sm font-bold">
            <input type="checkbox" name={k} defaultChecked={Boolean(d[k])} className="size-5 accent-[var(--color-accent)]" /> {label}
          </label>
        ))}
      </Card>
      <Button type="submit">Save settings</Button>
    </form>
  );
}
